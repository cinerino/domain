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
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as PaymentMethodRepo } from '../../repo/paymentMethod';
import { ICheckResult, MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';

const debug = createDebug('cinerino-domain:service');
export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    seller: SellerRepo;
    movieTicket: MovieTicketRepo;
    paymentMethod: PaymentMethodRepo;
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
        seller: SellerRepo;
        movieTicket: MovieTicketRepo;
        paymentMethod: PaymentMethodRepo;
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
            const movieTheater = await repos.seller.findById({
                id: params.object.seller.id
            });
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                movieTheater.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }

            checkResult = await repos.movieTicket.checkByIdentifier({
                movieTickets: params.object.movieTickets,
                movieTicketPaymentAccepted: movieTicketPaymentAccepted,
                screeningEvent: screeningEvent
            });

            // 一度認証されたムビチケをDBに記録する(後で検索しやすいように)
            await Promise.all(checkResult.movieTickets.map(async (movieTicketResult) => {
                const movieTicket: factory.paymentMethod.paymentCard.movieTicket.IMovieTicket = {
                    ...movieTicketResult,
                    serviceOutput: {
                        reservationFor: { typeOf: movieTicketResult.serviceOutput.reservationFor.typeOf, id: '' },
                        reservedTicket: {
                            ticketedSeat: {
                                typeOf: factory.chevre.placeType.ScreeningRoom,
                                seatingType: { typeOf: '' },
                                seatNumber: '',
                                seatRow: '',
                                seatSection: ''
                            }
                        }
                    }
                };
                await repos.paymentMethod.paymentMethodModel.findOneAndUpdate(
                    {
                        typeOf: factory.paymentMethodType.MovieTicket,
                        identifier: movieTicket.identifier
                    },
                    movieTicket,
                    { upsert: true }
                )
                    .exec();
            }));
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
        invoice: InvoiceRepo;
        seller: SellerRepo;
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
            const seller = await repos.seller.findById({
                id: order.seller.id
            });
            if (seller.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
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

            let skhnCd = screeningEvent.superEvent.workPerformed.identifier;
            const offeredThrough = screeningEvent.offers.offeredThrough;
            // イベントインポート元がCOAの場合、作品コード連携方法が異なる
            if (offeredThrough !== undefined && offeredThrough.identifier === factory.service.webAPI.Identifier.COA) {
                const DIGITS = -2;
                let eventCOAInfo: any;
                if (Array.isArray(screeningEvent.additionalProperty)) {
                    const coaInfoProperty = screeningEvent.additionalProperty.find((p) => p.name === 'coaInfo');
                    eventCOAInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
                }
                skhnCd = `${eventCOAInfo.titleCode}${`00${eventCOAInfo.titleBranchNum}`.slice(DIGITS)}`;
            }

            seatInfoSyncIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                yykDvcTyp: mvtkapi.mvtk.services.seat.seatInfoSync.ReserveDeviceType.EntertainerSitePC, // 予約デバイス区分
                trkshFlg: mvtkapi.mvtk.services.seat.seatInfoSync.DeleteFlag.False, // 取消フラグ
                kgygishSstmZskyykNo: order.orderNumber, // 興行会社システム座席予約番号
                kgygishUsrZskyykNo: order.confirmationNumber.toString(), // 興行会社ユーザー座席予約番号
                jeiDt: moment(screeningEvent.startDate)
                    .tz('Asia/Tokyo')
                    .format('YYYY/MM/DD HH:mm:ss'), // 上映日時
                kijYmd: moment(screeningEvent.startDate)
                    .tz('Asia/Tokyo')
                    .format('YYYY/MM/DD'), // 計上年月日
                stCd: movieTicketPaymentAccepted.movieTicketInfo.stCd,
                screnCd: screeningEvent.location.branchCode, // スクリーンコード
                knyknrNoInfo: knyknrNoInfo,
                zskInfo: seatNumbers.map((seatNumber) => {
                    return { zskCd: seatNumber };
                }),
                skhnCd: skhnCd // 作品コード
            };

            seatInfoSyncResult = await repos.movieTicketSeatService.seatInfoSync(seatInfoSyncIn);

            await Promise.all(params.object.map(async (paymentMethod) => {
                await repos.invoice.changePaymentStatus({
                    referencesOrder: { orderNumber: params.purpose.orderNumber },
                    paymentMethod: paymentMethod.paymentMethod.typeOf,
                    paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                    paymentStatus: factory.paymentStatusType.PaymentComplete
                });
            }));
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

/**
 * ムビチケ着券取消
 */
export function refundMovieTicket(params: factory.task.IData<factory.taskName.RefundMovieTicket>) {
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        invoice: InvoiceRepo;
        movieTicketSeatService: mvtkapi.service.Seat;
        task: TaskRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);
        let seatInfoSyncIn: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncIn;
        let seatInfoSyncResult: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncResult;
        try {
            const payAction = params.object;
            const payActionResult = payAction.result;
            if (payActionResult === undefined) {
                throw new factory.errors.NotFound('Pay Action Result');
            }

            seatInfoSyncIn = {
                ...payActionResult.seatInfoSyncIn,
                trkshFlg: mvtkapi.mvtk.services.seat.seatInfoSync.DeleteFlag.True // 取消フラグ
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

        // 潜在アクション
        await onRefund(params)({ task: repos.task });
    };
}

/**
 * 返金後のアクション
 * @param refundActionAttributes 返金アクション属性
 */
function onRefund(refundActionAttributes: factory.action.trade.refund.IAttributes<factory.paymentMethodType>) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendEmailMessage !== undefined) {
                const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                    name: factory.taskName.SendEmailMessage,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 3,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        actionAttributes: potentialActions.sendEmailMessage
                    }
                };
                taskAttributes.push(sendEmailMessageTask);
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
