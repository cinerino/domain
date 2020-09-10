/**
 * ムビチケ決済サービス
 */
import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

import { handleMvtkReserveError } from '../../errorHandler';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as PaymentMethodRepo } from '../../repo/paymentMethod';
import { ICheckResult, MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { findPayActionByOrderNumber, onRefund } from './any';
import * as ChevrePayment from './chevre';

import { createSeatInfoSyncIn } from './movieTicket/factory';

const USE_CHEVRE_PAY_MOVIE_TICKET = process.env.USE_CHEVRE_PAY_MOVIE_TICKET === '1';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const mvtkReserveAuthClient = new mvtkapi.auth.ClientCredentials({
    domain: credentials.mvtkReserve.authorizeServerDomain,
    clientId: credentials.mvtkReserve.clientId,
    clientSecret: credentials.mvtkReserve.clientSecret,
    scopes: [],
    state: ''
});

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
    movieTicket: MovieTicketRepo;
}) => Promise<T>;

export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    movieTicket: MovieTicketRepo;
    paymentMethod: PaymentMethodRepo;
}) => Promise<T>;

/**
 * 承認アクション
 */
export function authorize(params: {
    project: { id: string };
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        movieTicket: MovieTicketRepo;
    }) => {
        if (USE_CHEVRE_PAY_MOVIE_TICKET) {
            return ChevrePayment.authorize(params)(repos);
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('Transaction not yours');
        // }

        const movieTickets = params.object.movieTickets;
        if (!Array.isArray(movieTickets)) {
            throw new factory.errors.ArgumentNull('object.movieTickets');
        }

        // イベント1つのみ許可
        const eventIds = [...new Set(movieTickets.map((t) => t.serviceOutput.reservationFor.id))];
        if (eventIds.length !== 1) {
            throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
        }

        // ムビチケ購入管理番号は1つのみ許可
        const movieTicketIdentifiers = [...new Set(movieTickets.map((t) => t.identifier))];
        if (movieTicketIdentifiers.length !== 1) {
            throw new factory.errors.Argument('movieTickets', 'Number of movie ticket identifiers must be 1');
        }
        const movieTicketIdentifier = movieTicketIdentifiers[0];

        // ムビチケ系統の決済方法タイプは動的
        const paymentMethodType = movieTickets[0]?.typeOf;
        if (typeof paymentMethodType !== 'string') {
            throw new factory.errors.ArgumentNull('object.movieTickets.typeOf');
        }

        // イベント情報取得
        let screeningEvent: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;

        const eventService = new chevre.service.Event({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        screeningEvent = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
            id: eventIds[0]
        });

        // ショップ情報取得
        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const movieTheater = await sellerService.findById({ id: String(transaction.seller.id) });

        // まず取引番号発行
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const publishResult = await transactionNumberService.publish({ project: { id: transaction.project.id } });
        const transactionNumber = publishResult.transactionNumber;

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                accountId: movieTicketIdentifier,
                amount: 0,
                paymentMethod: paymentMethodType,
                paymentMethodId: transactionNumber, // 決済方法IDをtransactionNumberに変更
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
                // typeOf: paymentMethodType
            },
            agent: transaction.agent,
            instrument: {
                typeOf: 'WebAPI',
                identifier: factory.action.authorize.paymentMethod.any.ServiceIdentifier.MovieTicket
            },
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        let checkResult: ICheckResult | undefined;
        try {
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = movieTheater.paymentAccepted.find((a) => a.paymentMethodType === paymentMethodType);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', 'Movie Ticket payment not accepted');
            }

            checkResult = await repos.movieTicket.checkByIdentifier({
                movieTickets: movieTickets,
                movieTicketPaymentAccepted: movieTicketPaymentAccepted,
                screeningEvent: screeningEvent
            });

            // 要求に対して十分かどうか検証する
            const availableMovieTickets = checkResult.movieTickets.filter((t) => t.amount?.validThrough === undefined);

            // 総数が足りているか
            if (availableMovieTickets.length < movieTickets.length) {
                throw new factory.errors.Argument(
                    'movieTickets',
                    `${movieTickets.length - availableMovieTickets.length} movie tickets short`
                );
            }

            // 券種ごとに枚数が足りているか
            const serviceTypes = [...new Set(movieTickets.map((t) => t.serviceType))];
            serviceTypes.forEach((serviceType) => {
                const availableMovieTicketsByServiceType = availableMovieTickets.filter((t) => t.serviceType === serviceType);
                const requiredMovieTicketsByServiceType = movieTickets.filter((t) => t.serviceType === serviceType);
                if (availableMovieTicketsByServiceType.length < requiredMovieTicketsByServiceType.length) {
                    const shortNumber = requiredMovieTicketsByServiceType.length - availableMovieTicketsByServiceType.length;
                    throw new factory.errors.Argument(
                        'movieTickets',
                        `${shortNumber} movie tickets by service type ${serviceType} short`
                    );
                }
            });
        } catch (error) {
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
        const result: factory.action.authorize.paymentMethod.any.IResult = {
            accountId: movieTicketIdentifier,
            amount: 0,
            paymentMethod: paymentMethodType,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: transactionNumber, // 決済方法IDをtransactionNumberに変更
            name: (typeof params.object.name === 'string') ? params.object.name : paymentMethodType,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.chevre.unitCode.C62,
                value: movieTickets.length
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            purchaseNumberAuthResult: checkResult.purchaseNumberAuthResult,
            typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
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
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        // const actionResult = <factory.action.authorize.paymentMethod.movieTicket.IResult>action.result;

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
        project: ProjectRepo;
        movieTicket: MovieTicketRepo;
        paymentMethod: PaymentMethodRepo;
    }) => {
        // ムビチケ系統の決済方法タイプは動的
        const paymentMethodType = params.object.movieTickets[0]?.typeOf;
        if (typeof paymentMethodType !== 'string') {
            throw new factory.errors.ArgumentNull('object.movieTickets.typeOf');
        }

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
            let screeningEvent: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;

            const eventService = new chevre.service.Event({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            screeningEvent = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
                id: eventIds[0]
            });

            // ショップ情報取得
            const sellerService = new chevre.service.Seller({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const movieTheater = await sellerService.findById({ id: params.object.seller.id });
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = movieTheater.paymentAccepted.find((a) => a.paymentMethodType === paymentMethodType);
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
                const movieTicket: factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket = {
                    ...movieTicketResult,
                    serviceOutput: {
                        reservationFor: { typeOf: movieTicketResult.serviceOutput.reservationFor.typeOf, id: '' },
                        reservedTicket: {
                            ticketedSeat: {
                                typeOf: factory.chevre.placeType.Seat,
                                // seatingType: 'Default',
                                seatNumber: '',
                                seatRow: '',
                                seatSection: ''
                            }
                        }
                    }
                };
                await repos.paymentMethod.paymentMethodModel.findOneAndUpdate(
                    {
                        typeOf: paymentMethodType,
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
// tslint:disable-next-line:max-func-body-length
export function payMovieTicket(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }) => {
        const actionObject = params.object;

        // ムビチケ系統の決済方法タイプは動的
        const paymentMethodType = (Array.isArray(actionObject[0]?.movieTickets)) ? actionObject[0]?.movieTickets[0]?.typeOf : undefined;
        if (typeof paymentMethodType !== 'string') {
            throw new factory.errors.ArgumentNull('object.movieTickets.typeOf');
        }

        // アクション開始
        const action = await repos.action.start(params);

        let seatInfoSyncIn: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncIn;
        let seatInfoSyncResult: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncResult;

        try {
            // イベントがひとつに特定されているかどうか確認
            const eventIds = Array.from(new Set(actionObject.reduce<string[]>(
                (a, b) => [
                    ...a,
                    ...(Array.isArray(b.movieTickets)) ? b.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id) : []
                ],
                []
            )));
            if (eventIds.length !== 1) {
                throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
            }
            const eventId = eventIds[0];

            // イベント情報取得
            const eventService = new chevre.service.Event({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({ id: eventId });

            const sellerService = new chevre.service.Seller({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const seller = await sellerService.findById({ id: String(params.purpose.seller.id) });

            // 全購入管理番号のムビチケをマージ
            const movieTickets = actionObject.reduce<factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket[]>(
                (a, b) => [
                    ...a,
                    ...(Array.isArray(b.movieTickets)) ? b.movieTickets : []
                ],
                []
            );

            const paymentServiceUrl = await getMvtkReserveEndpoint({
                project: params.project,
                paymentMethodType: paymentMethodType
            });

            const movieTicketSeatService = new mvtkapi.service.Seat({
                endpoint: paymentServiceUrl,
                auth: mvtkReserveAuthClient
            });

            seatInfoSyncIn = createSeatInfoSyncIn({
                paymentMethodType: paymentMethodType,
                paymentMethodId: actionObject[0].paymentMethod.paymentMethodId,
                movieTickets: movieTickets,
                event: event,
                order: params.purpose,
                seller: seller
            });

            seatInfoSyncResult = await movieTicketSeatService.seatInfoSync(seatInfoSyncIn);

            await Promise.all(actionObject.map(async (paymentMethod) => {
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
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handleMvtkReserveError(error);
            throw error;
        }

        // アクション完了
        const actionResult: factory.action.trade.pay.IResult = {
            seatInfoSyncIn: seatInfoSyncIn,
            seatInfoSyncResult: seatInfoSyncResult
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * ムビチケ着券取消
 */
export function refundMovieTicket(params: factory.task.IData<factory.taskName.Refund>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        // ムビチケ系統の決済方法タイプは動的
        const paymentMethodType = params.object.typeOf;
        if (typeof paymentMethodType !== 'string') {
            throw new factory.errors.ArgumentNull('object.typeOf');
        }

        // 本アクションに対応するPayActionを取り出す
        const payAction = await findPayActionByOrderNumber({
            object: {
                paymentMethod: paymentMethodType,
                paymentMethodId: params.object.paymentMethodId
            },
            purpose: { orderNumber: params.purpose.orderNumber }
        })(repos);

        if (payAction === undefined) {
            throw new factory.errors.NotFound('PayAction');
        }

        const paymentServiceUrl = await getMvtkReserveEndpoint({
            project: params.project,
            paymentMethodType: paymentMethodType
        });

        const movieTicketSeatService = new mvtkapi.service.Seat({
            endpoint: paymentServiceUrl,
            auth: mvtkReserveAuthClient
        });

        // アクション開始
        const action = await repos.action.start(params);
        let seatInfoSyncIn: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncIn;
        let seatInfoSyncResult: mvtkapi.mvtk.services.seat.seatInfoSync.ISeatInfoSyncResult;
        try {
            // const payAction = params.object;
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
        const actionResult: factory.action.trade.pay.IResult = {
            seatInfoSyncIn: seatInfoSyncIn,
            seatInfoSyncResult: seatInfoSyncResult
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });

        // 潜在アクション
        await onRefund(params)({ project: repos.project, task: repos.task });
    };
}

async function getMvtkReserveEndpoint(params: {
    project: { id: string };
    paymentMethodType: string;
}): Promise<string> {
    const projectService = new chevre.service.Project({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });
    const chevreProject = await projectService.findById({ id: params.project.id });
    const paymentServiceSetting = chevreProject.settings?.paymentServices?.find((s) => {
        return s.typeOf === chevre.factory.service.paymentService.PaymentServiceType.MovieTicket
            && s.serviceOutput?.typeOf === params.paymentMethodType;
    });
    if (paymentServiceSetting === undefined) {
        throw new factory.errors.NotFound('PaymentService');
    }
    const paymentServiceUrl = paymentServiceSetting.availableChannel?.serviceUrl;
    if (typeof paymentServiceUrl !== 'string') {
        throw new factory.errors.NotFound('paymentService.availableChannel.serviceUrl');
    }

    return paymentServiceUrl;
}
