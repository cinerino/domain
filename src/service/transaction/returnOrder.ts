/**
 * 注文返品取引サービス
 */
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as chevre from '../../chevre';
import * as emailMessageBuilder from '../../emailMessageBuilder';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    invoice: InvoiceRepo;
    order: OrderRepo;
    transaction: TransactionRepo;
    cancelReservationService: chevre.service.transaction.CancelReservation;
}) => Promise<T>;
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

/**
 * 注文返品取引開始
 */
export function start(
    params: factory.transaction.returnOrder.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.returnOrder.ITransaction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        transaction: TransactionRepo;
        cancelReservationService: chevre.service.transaction.CancelReservation;
    }) => {
        // 返品対象の取引取得
        const order = await repos.order.findByOrderNumber({ orderNumber: params.object.order.orderNumber });

        // 注文ステータスが配送済の場合のみ受け付け
        if (order.orderStatus !== factory.orderStatus.OrderDelivered) {
            throw new factory.errors.Argument('Order Number', `Invalid Order Status: ${order.orderStatus}`);
        }

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [params.object.order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        // 決済がある場合、請求書の状態を検証
        if (order.paymentMethods.length > 0) {
            const invoices = await repos.invoice.search({ referencesOrder: { orderNumbers: [order.orderNumber] } });
            const allPaymentCompleted = invoices.every((invoice) => invoice.paymentStatus === factory.paymentStatusType.PaymentComplete);
            if (!allPaymentCompleted) {
                throw new factory.errors.Argument('order.orderNumber', 'Payment not completed');
            }
        }

        // 検証
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        // if (!params.forcibly) {
        //     validateRequest();
        // }

        const returnOrderAttributes: factory.transaction.IStartParams<factory.transactionType.ReturnOrder> = {
            typeOf: factory.transactionType.ReturnOrder,
            agent: params.agent,
            object: {
                clientUser: params.object.clientUser,
                order: order,
                cancellationFee: params.object.cancellationFee,
                reason: params.object.reason
            },
            expires: params.expires
        };

        let returnOrderTransaction: factory.transaction.returnOrder.ITransaction;
        try {
            returnOrderTransaction = await repos.transaction.start<factory.transactionType.ReturnOrder>(returnOrderAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 同一取引に対して返品取引を作成しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error ...',
                // code: 11000,

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.Argument('Order number', 'Already returned.');
                }
            }

            throw error;
        }

        // Chevre予約の場合、予約キャンセル取引開始
        const pendingCancelReservationTransactions: factory.chevre.transaction.cancelReservation.ITransaction[] = [];
        const authorizeSeatReservationActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
            placeOrderTransaction.object.authorizeActions
                .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

        for (const authorizeSeatReservationAction of authorizeSeatReservationActions) {
            if (authorizeSeatReservationAction.result === undefined) {
                throw new factory.errors.NotFound('Result of seat reservation authorize action');
            }

            let responseBody = authorizeSeatReservationAction.result.responseBody;

            if (authorizeSeatReservationAction.instrument === undefined) {
                authorizeSeatReservationAction.instrument = {
                    typeOf: 'WebAPI',
                    identifier: factory.service.webAPI.Identifier.Chevre
                };
            }

            switch (authorizeSeatReservationAction.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    // no op

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                    pendingCancelReservationTransactions.push(await repos.cancelReservationService.start({
                        typeOf: factory.chevre.transactionType.CancelReservation,
                        agent: {
                            typeOf: returnOrderTransaction.agent.typeOf,
                            id: returnOrderTransaction.agent.id,
                            name: order.customer.name
                        },
                        object: {
                            transaction: {
                                typeOf: responseBody.typeOf,
                                id: responseBody.id
                            }
                        },
                        expires: moment(params.expires).add(1, 'month').toDate() // 余裕を持って
                    }));
            }
        }

        await repos.transaction.transactionModel.findByIdAndUpdate(
            returnOrderTransaction.id,
            { 'object.pendingCancelReservationTransactions': pendingCancelReservationTransactions }
        ).exec();

        return returnOrderTransaction;
    };
}

/**
 * 取引確定
 */
export function confirm(params: {
    id: string;
    agent: { id: string };
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        organization: OrganizationRepo;
    }) => {
        let transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transaction', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transaction', 'Transaction already canceled');
        }

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const order = transaction.object.order;
        const seller = await repos.organization.findById({
            typeOf: order.seller.typeOf,
            id: order.seller.id
        });

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });
        const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.PayAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

        const emailMessage = await emailMessageBuilder.createRefundMessage({ order });
        const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
            typeOf: factory.actionType.SendAction,
            object: emailMessage,
            agent: {
                typeOf: seller.typeOf,
                id: seller.id,
                name: seller.name,
                url: seller.url
            },
            recipient: order.customer,
            potentialActions: {},
            purpose: order
        };
        // クレジットカード返金アクション
        const refundCreditCardActions = (<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>[]>payActions)
            .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.CreditCard)
            .map((a): factory.action.trade.refund.IAttributes<factory.paymentMethodType.CreditCard> => {
                return {
                    typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                    object: a,
                    agent: {
                        typeOf: seller.typeOf,
                        id: seller.id,
                        name: seller.name,
                        url: seller.url
                    },
                    recipient: order.customer,
                    purpose: order,
                    potentialActions: {
                        sendEmailMessage: sendEmailMessageActionAttributes
                    }
                };
            });
        // 口座返金アクション
        const refundAccountActions = (<factory.action.trade.pay.IAction<factory.paymentMethodType.Account>[]>payActions)
            .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.Account)
            .map((a): factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account> => {
                return {
                    typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                    object: a,
                    agent: {
                        typeOf: seller.typeOf,
                        id: seller.id,
                        name: seller.name,
                        url: seller.url
                    },
                    recipient: order.customer,
                    purpose: order,
                    potentialActions: {
                        sendEmailMessage: sendEmailMessageActionAttributes
                    }
                };
            });
        // ムビチケ着券返金アクション
        const refundMovieTicketActions = (<factory.action.trade.pay.IAction<factory.paymentMethodType.MovieTicket>[]>payActions)
            .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.MovieTicket)
            .map((a): factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket> => {
                return {
                    typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                    object: a,
                    agent: {
                        typeOf: seller.typeOf,
                        id: seller.id,
                        name: seller.name,
                        url: seller.url
                    },
                    recipient: order.customer,
                    purpose: order,
                    potentialActions: {
                        sendEmailMessage: sendEmailMessageActionAttributes
                    }
                };
            });
        // ポイントインセンティブの数だけ、返却アクションを作成
        const givePointActions = <factory.action.transfer.give.pointAward.IAction[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.GiveAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.transfer.give.pointAward.ObjectType.PointAward);
        const returnPointAwardActions = givePointActions.map(
            (a): factory.action.transfer.returnAction.pointAward.IAttributes => {
                return {
                    typeOf: factory.actionType.ReturnAction,
                    object: a,
                    agent: order.customer,
                    recipient: {
                        typeOf: seller.typeOf,
                        id: seller.id,
                        name: seller.name,
                        url: seller.url
                    },
                    potentialActions: {}
                };
            }
        );
        const returnOrderActionAttributes: factory.action.transfer.returnAction.order.IAttributes = {
            typeOf: <factory.actionType.ReturnAction>factory.actionType.ReturnAction,
            object: order,
            agent: order.customer,
            recipient: seller,
            potentialActions: {
                refundCreditCard: refundCreditCardActions,
                refundAccount: refundAccountActions,
                refundMovieTicket: refundMovieTicketActions,
                returnPointAward: returnPointAwardActions
            }
        };
        const result: factory.transaction.returnOrder.IResult = {
        };
        const potentialActions: factory.transaction.returnOrder.IPotentialActions = {
            returnOrder: returnOrderActionAttributes
        };

        // ステータス変更
        debug('updating transaction...');
        transaction = await repos.transaction.confirmReturnOrder({
            id: params.id,
            result: result,
            potentialActions: potentialActions
        });

        return transaction.result;
    };
}

/**
 * 返品取引バリデーション
 */
export function validateRequest() {
    // 現時点で特にバリデーション内容なし
}

/**
 * 返品取引のタスクをエクスポートする
 */
export function exportTasks(status: factory.transactionStatusType) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({ typeOf: factory.transactionType.ReturnOrder, status: status });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById(transaction)(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });
    };
}

/**
 * ID指定で取引のタスク出力
 */
export function exportTasksById(params: { id: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                // 注文返品タスク
                const returnOrderTask: factory.task.IAttributes<factory.taskName.ReturnOrder> = {
                    name: factory.taskName.ReturnOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        orderNumber: transaction.object.order.orderNumber
                    }
                };
                taskAttributes.push(returnOrderTask);
                break;

            case factory.transactionStatusType.Expired:
                // 特にタスクなし
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
