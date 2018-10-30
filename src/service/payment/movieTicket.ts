/**
 * ムビチケ決済サービス
 */
import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import { handleMvtkReserveError } from '../../errorHandler';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { ICheckResult, MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';

const debug = createDebug('cinerino-domain:service');
export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    organization: OrganizationRepo;
    movieTicket: MovieTicketRepo;
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
        movieTicket: MovieTicketRepo;
    }) => {
        const actionAttributes: factory.action.check.paymentMethod.movieTicket.IAttributes = {
            typeOf: factory.actionType.CheckAction,
            agent: params.agent,
            object: params.object
        };
        const action = await repos.action.start(actionAttributes);

        let checkResult: ICheckResult;
        try {
            const eventIds = [...new Set(params.object.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id))];
            if (eventIds.length !== 1) {
                throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
            }

            // イベント情報取得
            const screeningEvent = await repos.event.findById({ typeOf: factory.chevre.eventType.ScreeningEvent, id: eventIds[0] });

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

            checkResult = await repos.movieTicket.checkByIdentifier({
                movieTickets: params.object.movieTickets,
                movieTicketPaymentAccepted: movieTicketPaymentAccepted,
                screeningEvent: screeningEvent
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: actionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handleMvtkReserveError(error);
            throw error;
        }

        const result: factory.action.check.paymentMethod.movieTicket.IResult = checkResult;

        return repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });
    };
}

/**
 * ムビチケ着券
 */
export function payMovieTicket(params: factory.task.IData<factory.taskName.PayMovieTicket>) {
    // tslint:disable-next-line:max-func-body-length
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
            // イベントがひとつに特定されているかどうか確認
            const eventIds = Array.from(new Set(params.object.reduce<string[]>(
                (a, b) => [...a, ...b.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id)],
                []
            )));
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

            // 全購入管理番号のムビチケをマージ
            const movieTickets = params.object.reduce<factory.paymentMethod.paymentCard.movieTicket.IMovieTicket[]>(
                (a, b) => [...a, ...b.movieTickets], []
            );

            const knyknrNoInfo: mvtkapi.mvtk.services.seat.seatInfoSync.IKnyknrNoInfo[] = [];
            movieTickets.forEach((movieTicket) => {
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

            const seatNumbers = movieTickets.map((t) => t.serviceOutput.reservedTicket.ticketedSeat.seatNumber);
            seatInfoSyncIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                yykDvcTyp: mvtkapi.mvtk.services.seat.seatInfoSync.ReserveDeviceType.EntertainerSitePC, // 予約デバイス区分
                trkshFlg: mvtkapi.mvtk.services.seat.seatInfoSync.DeleteFlag.False, // 取消フラグ
                kgygishSstmZskyykNo: order.orderNumber, // 興行会社システム座席予約番号
                kgygishUsrZskyykNo: order.confirmationNumber.toString(), // 興行会社ユーザー座席予約番号
                jeiDt: moment(screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm:ss'), // 上映日時
                kijYmd: moment(screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD'), // 計上年月日
                stCd: movieTicketPaymentAccepted.movieTicketInfo.stCd,
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

            error = handleMvtkReserveError(error);
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
