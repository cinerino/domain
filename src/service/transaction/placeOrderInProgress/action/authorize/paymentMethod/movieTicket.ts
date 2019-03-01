/**
 * ムビチケ決済承認アクションサービス
 */
import * as createDebug from 'debug';

import { handleMvtkReserveError } from '../../../../../../errorHandler';
import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as EventRepo } from '../../../../../../repo/event';
import { ICheckResult, MvtkRepository as MovieTicketRepo } from '../../../../../../repo/paymentMethod/movieTicket';
import { MongoRepository as SellerRepo } from '../../../../../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
    movieTicket: MovieTicketRepo;
}) => Promise<T>;

/**
 * 承認アクション
 */
export function create(params: {
    object: factory.action.authorize.paymentMethod.movieTicket.IObject;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.paymentMethod.movieTicket.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        movieTicket: MovieTicketRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
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
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.paymentMethodType.MovieTicket,
                amount: 0,
                movieTickets: params.object.movieTickets,
                additionalProperty: params.object.additionalProperty
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
            name: 'ムビチケ',
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

export function cancel(params: {
    /**
     * 承認アクションID
     */
    id: string;
    /**
     * 取引進行者
     */
    agent: { id: string };
    /**
     * 取引
     */
    transaction: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
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
