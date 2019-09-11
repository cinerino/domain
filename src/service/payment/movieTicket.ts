/**
 * ムビチケ決済サービス
 */
import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import { credentials } from '../../credentials';

import { handleMvtkReserveError } from '../../errorHandler';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as PaymentMethodRepo } from '../../repo/paymentMethod';
import { ICheckResult, MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
    movieTicket: MovieTicketRepo;
}) => Promise<T>;

export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    seller: SellerRepo;
    movieTicket: MovieTicketRepo;
    paymentMethod: PaymentMethodRepo;
}) => Promise<T>;

/**
 * 承認アクション
 */
export function authorize(params: {
    object: factory.action.authorize.paymentMethod.movieTicket.IObject;
    agent: { id: string };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.movieTicket.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        movieTicket: MovieTicketRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // イベント1つのみ許可
        const eventIds = [...new Set(params.object.movieTickets.map((t) => t.serviceOutput.reservationFor.id))];
        if (eventIds.length !== 1) {
            throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
        }

        // ムビチケ購入管理番号は1つのみ許可
        const movieTicketIdentifiers = [...new Set(params.object.movieTickets.map((t) => t.identifier))];
        if (movieTicketIdentifiers.length !== 1) {
            throw new factory.errors.Argument('movieTickets', 'Number of movie ticket identifiers must be 1');
        }

        // イベント情報取得
        const screeningEvent = await repos.event.findById({ typeOf: factory.chevre.eventType.ScreeningEvent, id: eventIds[0] });

        // ショップ情報取得
        const movieTheater = await repos.seller.findById({
            id: transaction.seller.id
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.movieTicket.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                typeOf: factory.paymentMethodType.MovieTicket,
                amount: 0
            },
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        let checkResult: ICheckResult | undefined;
        try {
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                movieTheater.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', 'Movie Ticket payment not accepted');
            }

            checkResult = await repos.movieTicket.checkByIdentifier({
                movieTickets: params.object.movieTickets,
                movieTicketPaymentAccepted: movieTicketPaymentAccepted,
                screeningEvent: screeningEvent
            });

            // 要求に対して十分かどうか検証する
            const availableMovieTickets = checkResult.movieTickets.filter((t) => t.validThrough === undefined);

            // 総数が足りているか
            if (availableMovieTickets.length < params.object.movieTickets.length) {
                throw new factory.errors.Argument(
                    'movieTickets',
                    `${params.object.movieTickets.length - availableMovieTickets.length} movie tickets short`
                );
            }

            // 券種ごとに枚数が足りているか
            const serviceTypes = [...new Set(params.object.movieTickets.map((t) => t.serviceType))];
            serviceTypes.forEach((serviceType) => {
                const availableMovieTicketsByServiceType = availableMovieTickets.filter((t) => t.serviceType === serviceType);
                const requiredMovieTicketsByServiceType = params.object.movieTickets.filter((t) => t.serviceType === serviceType);
                if (availableMovieTicketsByServiceType.length < requiredMovieTicketsByServiceType.length) {
                    const shortNumber = requiredMovieTicketsByServiceType.length - availableMovieTicketsByServiceType.length;
                    throw new factory.errors.Argument(
                        'movieTickets',
                        `${shortNumber} movie tickets by service type ${serviceType} short`
                    );
                }
            });
        } catch (error) {
            debug(error);
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name, ...checkResult };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handleMvtkReserveError(error);
            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const result: factory.action.authorize.paymentMethod.movieTicket.IResult = {
            accountId: params.object.movieTickets[0].identifier,
            amount: 0,
            paymentMethod: factory.paymentMethodType.MovieTicket,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: params.object.movieTickets[0].identifier,
            name: (typeof params.object.name === 'string') ? params.object.name : String(factory.paymentMethodType.MovieTicket),
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.unitCode.C62,
                value: params.object.movieTickets.length
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            ...checkResult
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function voidTransaction(params: {
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.paymentMethod.movieTicket.IResult>action.result;
        debug('actionResult:', actionResult);

        // 承認取消
        try {
            // some op
        } catch (error) {
            // no op
        }
    };
}

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
            project: params.project,
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
                    project: params.project,
                    ...movieTicketResult,
                    serviceOutput: {
                        reservationFor: { typeOf: movieTicketResult.serviceOutput.reservationFor.typeOf, id: '' },
                        reservedTicket: {
                            ticketedSeat: {
                                typeOf: factory.chevre.placeType.ScreeningRoom,
                                seatingType: { typeOf: <any>'Default' },
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
        project: ProjectRepo;
        seller: SellerRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.mvtkReserve === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

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
            const offers = screeningEvent.offers;
            const offeredThrough = offers.offeredThrough;
            // イベントインポート元がCOAの場合、作品コード連携方法が異なる
            if (offeredThrough !== undefined && offeredThrough.identifier === factory.service.webAPI.Identifier.COA) {
                const DIGITS = -2;
                let eventCOAInfo: any;
                if (Array.isArray(screeningEvent.additionalProperty)) {
                    const coaInfoProperty = screeningEvent.additionalProperty.find((p) => p.name === 'coaInfo');
                    eventCOAInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                }
                skhnCd = `${eventCOAInfo.titleCode}${`00${eventCOAInfo.titleBranchNum}`.slice(DIGITS)}`;
            }

            const mvtkReserveAuthClient = new mvtkapi.auth.ClientCredentials({
                domain: credentials.mvtkReserve.authorizeServerDomain,
                clientId: credentials.mvtkReserve.clientId,
                clientSecret: credentials.mvtkReserve.clientSecret,
                scopes: [],
                state: ''
            });
            const movieTicketSeatService = new mvtkapi.service.Seat({
                endpoint: project.settings.mvtkReserve.endpoint,
                auth: mvtkReserveAuthClient
            });

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

            seatInfoSyncResult = await movieTicketSeatService.seatInfoSync(seatInfoSyncIn);

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
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.mvtkReserve === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const mvtkReserveAuthClient = new mvtkapi.auth.ClientCredentials({
            domain: credentials.mvtkReserve.authorizeServerDomain,
            clientId: credentials.mvtkReserve.clientId,
            clientSecret: credentials.mvtkReserve.clientSecret,
            scopes: [],
            state: ''
        });
        const movieTicketSeatService = new mvtkapi.service.Seat({
            endpoint: project.settings.mvtkReserve.endpoint,
            auth: mvtkReserveAuthClient
        });

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
            seatInfoSyncResult = await movieTicketSeatService.seatInfoSync(seatInfoSyncIn);
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
            if (Array.isArray(potentialActions.sendEmailMessage)) {
                potentialActions.sendEmailMessage.forEach((s) => {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: s.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: s
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                });
            }

        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
