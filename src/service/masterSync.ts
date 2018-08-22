/**
 * マスターデータ同期サービス
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';
import { google } from 'googleapis';
// @ts-ignore
// import * as difference from 'lodash.difference';

import { Repository as CreativeWorkRepo } from '../repo/creativeWork';
import { Repository as EventRepo } from '../repo/event';
import { Repository as PlaceRepo } from '../repo/place';

const debug = createDebug('cinerino-domain:*');
const customsearch = google.customsearch('v1');

/**
 * 映画作品インポート
 */
export function importMovies(_: {
    theaterCode: string;
    importFrom: Date;
    importThrough: Date;
}) {
    return async (repos: {
        creativeWork: CreativeWorkRepo;
        eventService: chevre.service.Event;
    }) => {
        // 上映イベントシリーズ検索
        const screeningEventSeries = await repos.eventService.searchScreeningEventSeries({
            // startFrom: params.importFrom,
            // endThrough: params.importThrough
        });
        debug('importing', screeningEventSeries.length, 'screeningEventSeries...');
        // 永続化
        await Promise.all(screeningEventSeries.map(async (series) => {
            const thumbnail = await findMovieImage({ query: series.workPerformed.name });
            const movie: factory.creativeWork.movie.ICreativeWork = {
                typeOf: factory.creativeWorkType.Movie,
                identifier: <string>series.identifier,
                name: series.workPerformed.name,
                duration: <string>series.duration,
                contentRating: []
                // description?: string;
                // copyrightHolder?: ICopyrightHolder;
                // copyrightYear?: number;
                // datePublished?: Date;
                // license?: string;
            };
            if (thumbnail !== undefined) {
                movie.thumbnailUrl = thumbnail;
            }
            debug('storing movie...', movie);
            await repos.creativeWork.saveMovie(movie);
            debug('movie stored.');
        }));
    };
}
/**
 * 上映イベントをインポートする
 */
export function importScreeningEvents(params: {
    theaterCode: string;
    importFrom: Date;
    importThrough: Date;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        place: PlaceRepo;
        eventService: chevre.service.Event;
    }) => {
        // 上映スケジュール取得
        const screeningEvents = await repos.eventService.searchScreeningEvents({
            // superEventLocationIds:[],
            // theaterCode: theaterCode,
            startFrom: params.importFrom,
            endThrough: params.importThrough
        });
        // 各作品画像を検索
        const movies = screeningEvents
            .map((e) => e.superEvent.workPerformed)
            .filter((movie, pos, arr) => arr.map((mapObj) => mapObj.identifier).indexOf(movie.identifier) === pos);
        const thumbnailsByMovie = await Promise.all(movies.map(async (movie) => {
            return {
                identifier: movie.identifier,
                thumbnail: await findMovieImage({ query: movie.name })
            };
        }));
        // 上映イベントごとに永続化トライ
        await Promise.all(screeningEvents.map(async (screeningEvent) => {
            try {
                // サムネイル画像があれば情報追加
                const thumbnailOfMovie = thumbnailsByMovie.find(
                    (t) => t.identifier === screeningEvent.superEvent.workPerformed.identifier
                );
                if (thumbnailOfMovie !== undefined && thumbnailOfMovie.thumbnail !== undefined) {
                    screeningEvent.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                    screeningEvent.superEvent.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                }
                await repos.event.saveScreeningEvent(screeningEvent);
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                console.error(error);
            }
        }));
        debug(`${screeningEvents.length} screeningEvents stored.`);
    };
}
/**
 * 劇場インポート
 */
export function importMovieTheater(params: { branchCode: string }) {
    return async (repos: {
        place: PlaceRepo;
        placeService: chevre.service.Place;
    }) => {
        const movieTheater = await repos.placeService.findMovieTheaterByBranchCode({ branchCode: params.branchCode });
        debug('storing movieTheater...', movieTheater);
        await repos.place.saveMovieTheater(movieTheater);
        debug('movieTheater stored.');
    };
}
export async function findMovieImage(params: {
    query: string;
}) {
    return new Promise<string | undefined>((resolve) => {
        customsearch.cse.list(
            {
                cx: <string>process.env.CUSTOM_SEARCH_ENGINE_ID,
                q: params.query,
                auth: <string>process.env.GOOGLE_API_KEY,
                num: 1,
                rights: 'cc_publicdomain cc_sharealike',
                // start: 0,
                // imgSize: 'medium',
                searchType: 'image'
            },
            (err: any, res: any) => {
                if (!(err instanceof Error)) {
                    if (typeof res.data === 'object' && Array.isArray(res.data.items) && res.data.items.length > 0) {
                        debug('custome search result:', res.data);
                        resolve(<string>res.data.items[0].image.thumbnailLink);
                        // resolve(<string>res.data.items[0].link);

                        return;
                        // thumbnails.push({
                        //     eventId: event.id,
                        //     link: res.data.items[0].link,
                        //     thumbnailLink: res.data.items[0].image.thumbnailLink
                        // });
                    }
                }

                resolve(undefined);
            }
        );
    });
}
