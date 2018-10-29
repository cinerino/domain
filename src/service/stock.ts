/**
 * 在庫管理サービス
 * 在庫仕入れ、在庫調整等
 */
import * as createDebug from 'debug';
import { google } from 'googleapis';
import * as moment from 'moment';

import * as chevre from '../chevre';
import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as EventRepo } from '../repo/event';

const debug = createDebug('cinerino-domain:service');
const customsearch = google.customsearch('v1');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 上映イベントをインポートする
 */
export function importScreeningEvents(params: {
    locationBranchCode: string;
    importFrom: Date;
    importThrough: Date;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        eventService: chevre.service.Event;
    }) => {
        // 上映スケジュール取得
        const limit = 100;
        let page = 0;
        let numData: number = limit;
        const screeningEvents: factory.chevre.event.screeningEvent.IEvent[] = [];
        while (numData === limit) {
            page += 1;
            const searchScreeningEventsResult = await repos.eventService.searchScreeningEvents({
                limit: limit,
                page: page,
                inSessionFrom: params.importFrom,
                inSessionThrough: params.importThrough,
                superEvent: {
                    locationBranchCodes: [params.locationBranchCode]
                }
            });
            numData = searchScreeningEventsResult.data.length;
            debug('numData:', numData);
            screeningEvents.push(...searchScreeningEventsResult.data);
        }

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
        await Promise.all(screeningEvents.map(async (e) => {
            try {
                // サムネイル画像があれば情報追加
                const thumbnailOfMovie = thumbnailsByMovie.find(
                    (t) => t.identifier === e.superEvent.workPerformed.identifier
                );
                if (thumbnailOfMovie !== undefined && thumbnailOfMovie.thumbnail !== undefined) {
                    e.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                    e.superEvent.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                }

                const superEvent: chevre.factory.event.screeningEventSeries.IEvent = {
                    ...e.superEvent,
                    startDate: (e.superEvent.startDate !== undefined) ? moment(e.superEvent.startDate).toDate() : undefined,
                    endDate: (e.superEvent.endDate !== undefined) ? moment(e.superEvent.endDate).toDate() : undefined
                };

                // Defaultオファーをセット
                let offers: chevre.factory.event.screeningEvent.IOffer = {
                    typeOf: 'Offer',
                    priceCurrency: chevre.factory.priceCurrency.JPY,
                    availabilityEnds: moment(e.endDate).toDate(),
                    availabilityStarts: moment(e.endDate).toDate(),
                    validFrom: moment(e.endDate).toDate(),
                    validThrough: moment(e.endDate).toDate(),
                    eligibleQuantity: {
                        value: 4,
                        unitCode: chevre.factory.unitCode.C62,
                        typeOf: 'QuantitativeValue'
                    }
                };
                // オファー設定があれば上書きする
                if (e.offers !== undefined && e.offers !== null) {
                    offers = {
                        ...e.offers,
                        availabilityEnds: moment(e.offers.availabilityEnds).toDate(),
                        availabilityStarts: moment(e.offers.availabilityEnds).toDate(),
                        validFrom: moment(e.offers.availabilityEnds).toDate(),
                        validThrough: moment(e.offers.availabilityEnds).toDate()
                    };
                }

                await repos.event.save<factory.chevre.eventType.ScreeningEvent>({
                    ...e,
                    superEvent: superEvent,
                    doorTime: (e.doorTime !== undefined) ? moment(e.doorTime).toDate() : undefined,
                    endDate: moment(e.endDate).toDate(),
                    startDate: moment(e.startDate).toDate(),
                    offers: offers
                });
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
 * Googleで作品画像を検索する
 */
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

/**
 * 座席仮予約キャンセル
 */
export function cancelSeatReservationAuth(params: { transactionId: string }) {
    return async (repos: {
        action: ActionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        // 座席仮予約アクションを取得
        const authorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>
            await repos.action.findAuthorizeByTransactionId(params).then((actions) => actions
                .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
            );
        await Promise.all(authorizeActions.map(async (action) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
                debug('calling reserve transaction...');
                await repos.reserveService.cancel({ transactionId: action.result.responseBody.id });
                await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
            }
        }));
    };
}
