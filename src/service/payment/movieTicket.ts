/**
 * ムビチケ決済サービス
 */
import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';

const debug = createDebug('cinerino-domain:service');
export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    organization: OrganizationRepo;
    movieTicketAuthService: mvtkapi.service.Auth;
}) => Promise<T>;
/**
 * ムビチケ認証
 */
export function checkMovieTicket(
    params: factory.action.check.paymentMethod.movieTicket.IAttributes
): ICheckMovieTicketOperation<factory.action.check.paymentMethod.movieTicket.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        organization: OrganizationRepo;
        movieTicketAuthService: mvtkapi.service.Auth;
    }) => {
        const actionAttributes: factory.action.check.paymentMethod.movieTicket.IAttributes = {
            typeOf: factory.actionType.CheckAction,
            agent: params.agent,
            object: params.object
        };
        const action = await repos.action.start(actionAttributes);

        let purchaseNumberAuthIn: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthIn;
        let purchaseNumberAuthResult: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthResult;
        const movieTicketResults: factory.action.check.paymentMethod.movieTicket.IMovieTicketResult[] = [];
        try {
            const eventIds = Array.from(new Set(params.object.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id)));
            if (eventIds.length !== 1) {
                throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
            }
            const eventId = eventIds[0];

            // イベント情報取得
            const screeningEvent = await repos.event.findById({ typeOf: factory.chevre.eventType.ScreeningEvent, id: eventId });

            // ショップ情報取得
            const movieTheater = await repos.organization.findById({
                typeOf: params.object.seller.typeOf,
                id: params.object.seller.id
            });
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                movieTheater.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }

            const movieTicketIdentifiers: string[] = [];
            const knyknrNoInfoIn: mvtkapi.mvtk.services.auth.purchaseNumberAuth.IKnyknrNoInfoIn[] = [];
            params.object.movieTickets.forEach((movieTicket) => {
                if (movieTicketIdentifiers.indexOf(movieTicket.identifier) < 0) {
                    movieTicketIdentifiers.push(movieTicket.identifier);
                    knyknrNoInfoIn.push({
                        knyknrNo: movieTicket.identifier,
                        pinCd: movieTicket.accessCode
                    });
                }
            });
            purchaseNumberAuthIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                jhshbtsCd: mvtkapi.mvtk.services.auth.purchaseNumberAuth.InformationTypeCode.All,
                knyknrNoInfoIn: knyknrNoInfoIn,
                skhnCd: screeningEvent.superEvent.workPerformed.identifier,
                stCd: movieTicketPaymentAccepted.movieTicketInfo.stCd,
                jeiYmd: moment(screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD')
            };
            purchaseNumberAuthResult = await repos.movieTicketAuthService.purchaseNumberAuth(purchaseNumberAuthIn);
            debug('purchaseNumberAuthResult:', purchaseNumberAuthResult);

            // ムビチケ配列に成形
            if (Array.isArray(purchaseNumberAuthResult.knyknrNoInfoOut)) {
                purchaseNumberAuthResult.knyknrNoInfoOut.forEach((knyknrNoInfoOut) => {
                    const knyknrNoInfo = knyknrNoInfoIn.find((info) => info.knyknrNo === knyknrNoInfoOut.knyknrNo);
                    if (knyknrNoInfo !== undefined) {
                        if (Array.isArray(knyknrNoInfoOut.ykknInfo)) {
                            knyknrNoInfoOut.ykknInfo.forEach((ykknInfo) => {
                                [...Array(Number(ykknInfo.ykknKnshbtsmiNum))].forEach(() => {
                                    movieTicketResults.push({
                                        typeOf: factory.paymentMethodType.MovieTicket,
                                        identifier: knyknrNoInfo.knyknrNo,
                                        accessCode: knyknrNoInfo.pinCd,
                                        serviceType: ykknInfo.ykknshTyp,
                                        serviceOutput: {
                                            reservationFor: {
                                                typeOf: screeningEvent.typeOf,
                                                id: screeningEvent.id
                                            },
                                            reservedTicket: {
                                                ticketedSeat: {
                                                    typeOf: factory.chevre.placeType.Seat,
                                                    seatingType: '', // 情報空でよし
                                                    seatNumber: '', // 情報空でよし
                                                    seatRow: '', // 情報空でよし
                                                    seatSection: '' // 情報空でよし
                                                }
                                            }
                                        }
                                    });
                                });
                            });
                        }
                        if (Array.isArray(knyknrNoInfoOut.mkknInfo)) {
                            knyknrNoInfoOut.mkknInfo.forEach((mkknInfo) => {
                                [...Array(Number(mkknInfo.mkknKnshbtsmiNum))].forEach(() => {
                                    movieTicketResults.push({
                                        typeOf: factory.paymentMethodType.MovieTicket,
                                        identifier: knyknrNoInfo.knyknrNo,
                                        accessCode: knyknrNoInfo.pinCd,
                                        serviceType: mkknInfo.mkknshTyp,
                                        serviceOutput: {
                                            reservationFor: {
                                                typeOf: screeningEvent.typeOf,
                                                id: screeningEvent.id
                                            },
                                            reservedTicket: {
                                                ticketedSeat: {
                                                    typeOf: factory.chevre.placeType.Seat,
                                                    seatingType: '', // 情報空でよし
                                                    seatNumber: '', // 情報空でよし
                                                    seatRow: '', // 情報空でよし
                                                    seatSection: '' // 情報空でよし
                                                }
                                            }
                                        },
                                        validThrough: moment(`${mkknInfo.yykDt}+09:00`, 'YYYY/MM/DD HH:mm:ssZ').toDate()
                                    });
                                });
                            });
                        }
                    }
                });
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: actionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        const result: factory.action.check.paymentMethod.movieTicket.IResult = {
            purchaseNumberAuthIn: purchaseNumberAuthIn,
            purchaseNumberAuthResult: purchaseNumberAuthResult,
            movieTickets: movieTicketResults
        };

        return repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });
    };
}

/**
 * ムビチケ着券
 */
// tslint:disable-next-line:max-func-body-length
export function payMovieTicket(params: factory.task.IData<factory.taskName.PayMovieTicket>) {
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        organization: OrganizationRepo;
        movieTicketSeatService: mvtkapi.service.Seat;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);
        let seatInfoSyncIn: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncIn;
        let seatInfoSyncResult: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncResult;
        try {
            const eventIds = Array.from(new Set(params.object.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id)));
            if (eventIds.length !== 1) {
                throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
            }
            const eventId = eventIds[0];

            // イベント情報取得
            const screeningEvent = await repos.event.findById({ typeOf: factory.chevre.eventType.ScreeningEvent, id: eventId });

            const order = params.purpose;

            // ショップ情報取得
            const seller = <factory.organization.movieTheater.IOrganization>await repos.organization.findById({
                typeOf: order.seller.typeOf,
                id: order.seller.id
            });
            if (seller.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                seller.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }

            const knyknrNoInfo: mvtkapi.mvtk.services.seat.seatInfoSync.IKnyknrNoInfo[] = [];
            params.object.movieTickets.forEach((movieTicket) => {
                let knyknrNoInfoByKnyknrNoIndex = knyknrNoInfo.findIndex((i) => i.knyknrNo === movieTicket.identifier);
                if (knyknrNoInfoByKnyknrNoIndex < 0) {
                    knyknrNoInfoByKnyknrNoIndex = knyknrNoInfo.push({
                        knyknrNo: movieTicket.identifier,
                        pinCd: movieTicket.accessCode,
                        knshInfo: []
                    }) - 1;
                }

                let knshInfoIndex = knyknrNoInfo[knyknrNoInfoByKnyknrNoIndex].knshInfo.findIndex(
                    (i) => i.knshTyp === movieTicket.serviceType
                );
                if (knshInfoIndex < 0) {
                    knshInfoIndex = knyknrNoInfo[knyknrNoInfoByKnyknrNoIndex].knshInfo.push({
                        knshTyp: movieTicket.serviceType,
                        miNum: 0
                    }) - 1;
                }
                knyknrNoInfo[knyknrNoInfoByKnyknrNoIndex].knshInfo[knshInfoIndex].miNum += 1;
            });

            const seatNumbers = params.object.movieTickets.map((t) => t.serviceOutput.reservedTicket.ticketedSeat.seatNumber);
            seatInfoSyncIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                yykDvcTyp: mvtkapi.mvtk.services.seat.seatInfoSync.ReserveDeviceType.EntertainerSitePC, // 予約デバイス区分
                trkshFlg: mvtkapi.mvtk.services.seat.seatInfoSync.DeleteFlag.False, // 取消フラグ
                kgygishSstmZskyykNo: order.orderNumber, // 興行会社システム座席予約番号
                kgygishUsrZskyykNo: order.confirmationNumber.toString(), // 興行会社ユーザー座席予約番号
                jeiDt: moment(screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss'), // 上映日時
                kijYmd: moment(order.orderDate).tz('Asia/Tokyo').format('YYYY/MM/DD'), // 計上年月日
                stCd: seller.location.branchCode, // サイトコード
                screnCd: screeningEvent.location.branchCode, // スクリーンコード
                knyknrNoInfo: knyknrNoInfo,
                zskInfo: seatNumbers.map((seatNumber) => {
                    return { zskCd: seatNumber };
                }),
                skhnCd: screeningEvent.superEvent.workPerformed.identifier // 作品コード
            };

            seatInfoSyncResult = await repos.movieTicketSeatService.seatInfoSync(seatInfoSyncIn);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.MovieTicket> = {
            seatInfoSyncIn: seatInfoSyncIn,
            seatInfoSyncResult: seatInfoSyncResult
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
