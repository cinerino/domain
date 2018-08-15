/**
 * マスターデータ同期サービス
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as createDebug from 'debug';
// @ts-ignore
// import * as difference from 'lodash.difference';

import { Repository as CreativeWorkRepo } from '../repo/creativeWork';
import { Repository as EventRepo } from '../repo/event';
import { Repository as PlaceRepo } from '../repo/place';

const debug = createDebug('cinerino-domain:*');

/**
 * 映画作品インポート
 */
export function importMovies(_: { branchCode: string }) {
    return async (__: { creativeWork: CreativeWorkRepo }) => {
        // COAから作品取得
        // const filmsFromCOA = await COA.services.master.title({ theaterCode: theaterCode });

        // 永続化
        // await Promise.all(filmsFromCOA.map(async (filmFromCOA) => {
        //     const movie = factory.creativeWork.movie.createFromCOA(filmFromCOA);
        //     debug('storing movie...', movie);
        //     await repos.creativeWork.saveMovie(movie);
        //     debug('movie stored.');
        // }));
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

        // // 永続化
        // const screeningEvents = await Promise.all(filmsFromCOA.map(async (filmFromCOA) => {
        //     const screeningEvent = factory.event.screeningEvent.createFromCOA({
        //         filmFromCOA: filmFromCOA,
        //         movieTheater: movieTheater,
        //         eirinKubuns: eirinKubuns,
        //         eizouKubuns: eizouKubuns,
        //         joueihousikiKubuns: joueihousikiKubuns,
        //         jimakufukikaeKubuns: jimakufukikaeKubuns
        //     });
        //     await repos.event.saveScreeningEvent(screeningEvent);

        //     return screeningEvent;
        // }));

        // 上映イベントごとに永続化トライ
        await Promise.all(screeningEvents.map(async (screeningEvent) => {
            try {
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
