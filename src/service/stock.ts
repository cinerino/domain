/**
 * 在庫管理サービス
 * 在庫仕入れ、在庫調整等
 */
import { google } from 'googleapis';
import * as moment from 'moment';

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as factory from '../factory';

import { MongoRepository as EventRepo } from '../repo/event';
import { RedisRepository as EventAttendeeCapacityRepo } from '../repo/event/attendeeCapacity';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as SellerRepo } from '../repo/seller';

import * as MasterSyncService from './masterSync';

const customsearch = google.customsearch('v1');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export import WebAPIIdentifier = factory.service.webAPI.Identifier;
export type IScreeningEvent = factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;

/**
 * イベントをインポートする
 */
export function importScreeningEvents(params: factory.task.IData<factory.taskName.ImportScreeningEvents>) {
    return async (repos: {
        event: EventRepo;
        project: ProjectRepo;
        seller: SellerRepo;
    }) => {
        // COAイベントの場合、masterSyncサービスを使用
        if (params.offeredThrough !== undefined && params.offeredThrough.identifier === WebAPIIdentifier.COA) {
            await MasterSyncService.importScreeningEvents(params)(repos);

            return;
        }

        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        // Chevreでイベント検索
        const limit = 100;
        let page = 0;
        let numData: number = limit;
        const events: IScreeningEvent[] = [];
        while (numData === limit) {
            page += 1;
            const searchScreeningEventsResult = await eventService.search<factory.chevre.eventType.ScreeningEvent>({
                limit: limit,
                page: page,
                project: { ids: [project.id] },
                typeOf: factory.chevre.eventType.ScreeningEvent,
                inSessionFrom: params.importFrom,
                inSessionThrough: params.importThrough,
                superEvent: {
                    locationBranchCodes: [params.locationBranchCode]
                }
            });
            numData = searchScreeningEventsResult.data.length;
            events.push(...searchScreeningEventsResult.data);
        }

        // 一定量ずつ順に保管する
        // tslint:disable-next-line:prefer-array-literal
        for (const key of [...Array(page)].keys()) {
            const savingEvents = events.slice(limit * key, limit * (key + 1));
            await saveEvents({ events: savingEvents })(repos);
        }
        // await saveEvents({ events })(repos);
    };
}

/**
 * イベントを保管する
 */
function saveEvents(params: {
    events: IScreeningEvent[];
}) {
    return async (repos: {
        event: EventRepo;
    }) => {
        const events = params.events;

        // 各作品画像を検索
        // いったん停止
        // const movies = events
        //     .map((e) => e.superEvent.workPerformed)
        //     .filter((movie, pos, arr) => arr.map((mapObj) => mapObj.identifier)
        //         .indexOf(movie.identifier) === pos);
        // const thumbnailsByMovie = await Promise.all(movies.map(async (movie) => {
        //     return {
        //         identifier: movie.identifier,
        //         thumbnail: await findMovieImage({ query: movie.name })
        //     };
        // }));
        const thumbnailsByMovie: {
            identifier: string;
            thumbnail?: string;
        }[] = [];

        // イベントごとに永続化トライ
        await Promise.all(events.map(async (e) => {
            try {
                if (e.workPerformed !== undefined) {
                    // サムネイル画像があれば情報追加
                    const thumbnailOfMovie = thumbnailsByMovie.find(
                        (t) => t.identifier === e.superEvent.workPerformed.identifier
                    );
                    if (thumbnailOfMovie !== undefined && thumbnailOfMovie.thumbnail !== undefined) {
                        e.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                        e.superEvent.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                    }
                }

                const superEvent: chevre.factory.event.screeningEventSeries.IEvent = {
                    ...e.superEvent,
                    startDate: (e.superEvent.startDate !== undefined) ? moment(e.superEvent.startDate)
                        .toDate() : undefined,
                    endDate: (e.superEvent.endDate !== undefined) ? moment(e.superEvent.endDate)
                        .toDate() : undefined
                };

                let offers = <factory.event.IOffer<factory.chevre.eventType.ScreeningEvent>>e.offers;
                offers = {
                    ...offers,
                    availabilityEnds: moment(offers.availabilityEnds)
                        .toDate(),
                    availabilityStarts: moment(offers.availabilityStarts)
                        .toDate(),
                    validFrom: moment(offers.validFrom)
                        .toDate(),
                    validThrough: moment(offers.validThrough)
                        .toDate(),
                    offeredThrough: { typeOf: 'WebAPI', identifier: WebAPIIdentifier.Chevre }
                };

                await repos.event.save<factory.chevre.eventType.ScreeningEvent>({
                    ...e,
                    superEvent: superEvent,
                    doorTime: (e.doorTime !== undefined) ? moment(e.doorTime)
                        .toDate() : undefined,
                    endDate: moment(e.endDate)
                        .toDate(),
                    startDate: moment(e.startDate)
                        .toDate(),
                    offers: offers
                });
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                // tslint:disable-next-line:no-console
                console.error(error);
            }
        }));
    };
}
/**
 * Googleで作品画像を検索する
 */
export async function findMovieImage(params: {
    query: string;
}): Promise<string | undefined> {
    // カスタム検索エンジンIDの指定がなければ検索しない
    if (typeof credentials.customSearch.engineId !== 'string' || typeof credentials.customSearch.apiKey !== 'string') {
        return;
    }

    return new Promise<string | undefined>((resolve) => {
        customsearch.cse.list(
            {
                cx: credentials.customSearch.engineId,
                q: params.query,
                auth: credentials.customSearch.apiKey,
                num: 1,
                rights: 'cc_publicdomain cc_sharealike',
                // start: 0,
                // imgSize: 'medium',
                searchType: 'image'
            },
            (err: any, res: any) => {
                if (!(err instanceof Error)) {
                    if (typeof res.data === 'object' && Array.isArray(res.data.items) && res.data.items.length > 0) {
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

                resolve();
            }
        );
    });
}

/**
 * イベント残席数を更新する
 */
export function updateEventAttendeeCapacity(params: factory.task.IData<factory.taskName.UpdateEventAttendeeCapacity>) {
    return async (repos: {
        attendeeCapacity: EventAttendeeCapacityRepo;
        project: ProjectRepo;
    }) => {
        // COAイベントの場合、masterSyncサービスを使用
        if (params.offeredThrough !== undefined && params.offeredThrough.identifier === WebAPIIdentifier.COA) {
            await MasterSyncService.updateEventAttendeeCapacity(params)(repos);

            return;
        }

        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        // イベント検索
        const limit = 100;
        let page = 0;
        let numData: number = limit;
        const events: IScreeningEvent[] = [];
        while (numData === limit) {
            page += 1;
            const searchScreeningEventsResult = await eventService.search<factory.chevre.eventType.ScreeningEvent>({
                limit: limit,
                page: page,
                project: { ids: [project.id] },
                typeOf: factory.chevre.eventType.ScreeningEvent,
                inSessionFrom: params.importFrom,
                inSessionThrough: params.importThrough,
                superEvent: {
                    locationBranchCodes: [params.locationBranchCode]
                }
            });
            numData = searchScreeningEventsResult.data.length;
            events.push(...searchScreeningEventsResult.data);
        }

        await repos.attendeeCapacity.updateByEventIds(events.map((e) => {
            return { id: e.id, remainingAttendeeCapacity: e.remainingAttendeeCapacity };
        }));
    };
}
