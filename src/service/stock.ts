/**
 * 在庫管理サービス
 * 在庫仕入れ、在庫調整等
 */
import { google } from 'googleapis';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
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

export import IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;
export import WebAPIIdentifier = factory.service.webAPI.Identifier;
export type IAuthorizeSeatReservationResponse<T extends WebAPIIdentifier> =
    factory.action.authorize.offer.seatReservation.IResponseBody<T>;

/**
 * イベントをインポートする
 */
export function importScreeningEvents(params: factory.task.IData<factory.taskName.ImportScreeningEvents>) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        project: ProjectRepo;
        seller: SellerRepo;
    }) => {
        // COAイベントの場合、masterSyncサービスを使用
        if (params.offeredThrough !== undefined && params.offeredThrough.identifier === WebAPIIdentifier.COA) {
            await MasterSyncService.importScreeningEvents(params)(repos);
            // await importScreeningEventsFromCOA(params)(repos);

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

        // 上映スケジュール取得
        const limit = 100;
        let page = 0;
        let numData: number = limit;
        const events: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>[] = [];
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

        // 各作品画像を検索
        const movies = events
            .map((e) => e.superEvent.workPerformed)
            .filter((movie, pos, arr) => arr.map((mapObj) => mapObj.identifier)
                .indexOf(movie.identifier) === pos);
        const thumbnailsByMovie = await Promise.all(movies.map(async (movie) => {
            return {
                identifier: movie.identifier,
                thumbnail: await findMovieImage({ query: movie.name })
            };
        }));

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
 * 座席仮予約キャンセル
 */
export function cancelSeatReservationAuth(params: factory.task.IData<factory.taskName.CancelSeatReservation>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // 座席仮予約アクションを取得
        const authorizeActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            })
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
                );

        await Promise.all(authorizeActions.map(async (action) => {
            if (action.instrument === undefined) {
                action.instrument = {
                    typeOf: 'WebAPI',
                    identifier: WebAPIIdentifier.Chevre
                };
            }

            switch (action.instrument.identifier) {
                case WebAPIIdentifier.COA:
                    // COAの場合、resultに連携内容情報が記録されているので、その情報を元に仮予約を取り消す
                    if (action.result !== undefined) {
                        const requestBody = action.result.requestBody;
                        const responseBody = <IAuthorizeSeatReservationResponse<WebAPIIdentifier.COA>>action.result.responseBody;

                        // COAで仮予約取消
                        const updTmpReserveSeatArgs = requestBody;
                        const updTmpReserveSeatResult = responseBody;

                        try {
                            await COA.services.reserve.delTmpReserve({
                                theaterCode: updTmpReserveSeatArgs.theaterCode,
                                dateJouei: updTmpReserveSeatArgs.dateJouei,
                                titleCode: updTmpReserveSeatArgs.titleCode,
                                titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                                timeBegin: updTmpReserveSeatArgs.timeBegin,
                                tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum
                            });
                        } catch (error) {
                            let deleted = false;
                            // COAサービスエラーの場合ハンドリング
                            // tslint:disable-next-line:no-single-line-block-comment
                            /* istanbul ignore if */
                            if (error.name === 'COAServiceError') {
                                if (Number.isInteger(error.code) && error.code < INTERNAL_SERVER_ERROR) {
                                    // すでに取消済の場合こうなるので、okとする
                                    if (error.message === '座席取消失敗') {
                                        deleted = true;
                                    }
                                    // if (action.actionStatus === factory.actionStatusType.CanceledActionStatus) {
                                    //     deleted = true;
                                    // }
                                }
                            }

                            if (!deleted) {
                                throw error;
                            }
                        }
                    }

                    break;

                default:
                    // Chevreの場合、objectの進行中取引情報を元に、予約取引を取り消す
                    if (project.settings === undefined
                        || project.settings.chevre === undefined) {
                        throw new factory.errors.ServiceUnavailable('Project settings undefined');
                    }

                    const reserveService = new chevre.service.transaction.Reserve({
                        endpoint: project.settings.chevre.endpoint,
                        auth: chevreAuthClient
                    });

                    const pendingTransaction = action.object.pendingTransaction;

                    if (pendingTransaction !== undefined) {
                        // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
                        await reserveService.cancel({ id: pendingTransaction.id });
                    }
            }

            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
        }));
    };
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
        const events: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>[] = [];
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
