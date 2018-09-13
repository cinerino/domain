/**
 * 注文返品取引サービス
 */
import * as createDebug from 'debug';
import * as pug from 'pug';

import * as chevre from '../../chevre';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    order: OrderRepo;
    transaction: TransactionRepo;
    cancelReservationService: chevre.service.transaction.CancelReservation;
}) => Promise<T>;
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
/**
 * 注文返品取引開始
 * @param params 開始パラメーター
 */
// tslint:disable-next-line:max-func-body-length
export function start(params: {
    /**
     * 取引期限
     */
    expires: Date;
    /**
     * 主体者ID
     */
    agentId: string;
    /**
     * APIクライアント
     */
    clientUser: factory.clientUser.IClientUser;
    /**
     * 取引ID
     */
    transactionId: string;
    /**
     * キャンセル手数料
     */
    cancellationFee: number;
    /**
     * 強制的に返品するかどうか
     * 管理者の判断で返品する場合、バリデーションをかけない
     */
    forcibly: boolean;
    /**
     * 返品理由
     */
    reason: factory.transaction.returnOrder.Reason;
}): IStartOperation<factory.transaction.returnOrder.ITransaction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        transaction: TransactionRepo;
        cancelReservationService: chevre.service.transaction.CancelReservation;
    }) => {
        const now = new Date();

        // 返品対象の取引取得
        const placeOrderTransaction = await repos.transaction.findById(factory.transactionType.PlaceOrder, params.transactionId);
        if (placeOrderTransaction.status !== factory.transactionStatusType.Confirmed) {
            throw new factory.errors.Argument('transactionId', 'Status not Confirmed.');
        }

        const placeOrderTransactionResult = placeOrderTransaction.result;
        if (placeOrderTransactionResult === undefined) {
            throw new factory.errors.NotFound('placeOrderTransaction.result');
        }

        // 注文ステータスが配送済の場合のみ受け付け
        const order = await repos.order.findByOrderNumber(placeOrderTransactionResult.order.orderNumber);
        if (order.orderStatus !== factory.orderStatus.OrderDelivered) {
            throw new factory.errors.Argument('transaction', 'order status is not OrderDelivered');
        }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });
        const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.PayAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);
        // もし支払アクションがなければエラー
        if (payActions.length === 0) {
            throw new factory.errors.NotFound('PayAction');
        }

        // 検証
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (!params.forcibly) {
            validateRequest();
        }

        const returnOrderAttributes: factory.transaction.returnOrder.IAttributes = {
            typeOf: factory.transactionType.ReturnOrder,
            status: factory.transactionStatusType.InProgress,
            agent: {
                typeOf: factory.personType.Person,
                id: params.agentId,
                url: ''
            },
            object: {
                clientUser: params.clientUser,
                transaction: placeOrderTransaction,
                cancellationFee: params.cancellationFee,
                reason: params.reason
            },
            expires: params.expires,
            startDate: now,
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        };

        let returnOrderTransaction: factory.transaction.returnOrder.ITransaction;
        try {
            returnOrderTransaction = await repos.transaction.start(factory.transactionType.ReturnOrder, returnOrderAttributes);
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
                    throw new factory.errors.AlreadyInUse('transaction', ['object.transaction'], 'Already returned.');
                }
            }

            throw error;
        }

        // 予約キャンセル取引開始
        const authorizeSeatReservationAction = <factory.action.authorize.offer.seatReservation.IAction>
            placeOrderTransaction.object.authorizeActions
                .find((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
        const reserveTransaction
            = (<factory.action.authorize.offer.seatReservation.IResult>authorizeSeatReservationAction.result).responseBody;
        const cancelReservationTransaction = await repos.cancelReservationService.start({
            typeOf: factory.chevre.transactionType.CancelReservation,
            agent: {
                typeOf: returnOrderTransaction.agent.typeOf,
                id: returnOrderTransaction.agent.id,
                name: reserveTransaction.agent.name
            },
            object: {
                transaction: {
                    typeOf: reserveTransaction.typeOf,
                    id: reserveTransaction.id
                }
            },
            expires: params.expires
        });
        await repos.transaction.transactionModel.findByIdAndUpdate(
            returnOrderTransaction.id,
            { 'object.pendingCancelReservationTransaction': cancelReservationTransaction }
        ).exec();

        return returnOrderTransaction;
    };
}

/**
 * 取引確定
 */
export function confirm(
    agentId: string,
    transactionId: string
) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        organization: OrganizationRepo;
    }) => {
        let transaction = await repos.transaction.findById(factory.transactionType.ReturnOrder, transactionId);
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transactionId', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
        }

        if (transaction.agent.id !== agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 結果作成
        const placeOrderTransaction = transaction.object.transaction;
        const placeOrderTransactionResult = placeOrderTransaction.result;
        if (placeOrderTransactionResult === undefined) {
            throw new factory.errors.NotFound('placeOrderTransaction.result');
        }
        const customerContact = placeOrderTransaction.object.customerContact;
        if (customerContact === undefined) {
            throw new factory.errors.NotFound('customerContact');
        }

        const seller = await repos.organization.findById({
            typeOf: <factory.organizationType.MovieTheater>placeOrderTransaction.seller.typeOf,
            id: placeOrderTransaction.seller.id
        });

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: placeOrderTransactionResult.order.orderNumber });
        const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.PayAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);
        // もし支払アクションがなければエラー
        if (payActions.length === 0) {
            throw new factory.errors.NotFound('PayAction');
        }

        const emailMessage = await createRefundEmail({
            transaction: placeOrderTransaction,
            customerContact: customerContact,
            order: placeOrderTransactionResult.order,
            seller: seller
        });
        const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
            typeOf: factory.actionType.SendAction,
            object: emailMessage,
            agent: placeOrderTransaction.seller,
            recipient: placeOrderTransaction.agent,
            potentialActions: {},
            purpose: placeOrderTransactionResult.order
        };
        // クレジットカード返金アクション
        const refundCreditCardActions = (<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>[]>payActions)
            .filter((a) => a.object.paymentMethod.typeOf === factory.paymentMethodType.CreditCard)
            .map((a): factory.action.trade.refund.IAttributes<factory.paymentMethodType.CreditCard> => {
                return {
                    typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                    object: a,
                    agent: placeOrderTransaction.seller,
                    recipient: placeOrderTransaction.agent,
                    purpose: placeOrderTransactionResult.order,
                    potentialActions: {
                        sendEmailMessage: sendEmailMessageActionAttributes
                    }
                };
            });
        // 口座返金アクション
        const refundAccountActions = (<factory.action.trade.pay.IAction<factory.paymentMethodType.Account>[]>payActions)
            .filter((a) => a.object.paymentMethod.typeOf === factory.paymentMethodType.Account)
            .map((a): factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account> => {
                return {
                    typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                    object: a,
                    agent: placeOrderTransaction.seller,
                    recipient: placeOrderTransaction.agent,
                    purpose: placeOrderTransactionResult.order,
                    potentialActions: {
                        sendEmailMessage: sendEmailMessageActionAttributes
                    }
                };
            });
        // Pecorino賞金の承認アクションの数だけ、返却アクションを作成
        const authorizeActions = placeOrderTransaction.object.authorizeActions;
        const returnPointAwardActions = authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward)
            .map((a: factory.action.authorize.award.point.IAction): factory.action.transfer.returnAction.pointAward.IAttributes => {
                return {
                    typeOf: factory.actionType.ReturnAction,
                    object: a,
                    agent: placeOrderTransaction.seller,
                    recipient: placeOrderTransaction.agent,
                    potentialActions: {}
                };
            });
        const returnOrderActionAttributes: factory.action.transfer.returnAction.order.IAttributes = {
            typeOf: <factory.actionType.ReturnAction>factory.actionType.ReturnAction,
            object: placeOrderTransactionResult.order,
            agent: placeOrderTransaction.agent,
            recipient: placeOrderTransaction.seller,
            potentialActions: {
                refundCreditCard: refundCreditCardActions[0],
                refundAccount: refundAccountActions,
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
        transaction = await repos.transaction.confirmReturnOrder(
            transactionId,
            result,
            potentialActions
        );

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
 * 返金メールを作成する
 */
export async function createRefundEmail(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    customerContact: factory.transaction.placeOrder.ICustomerContact;
    order: factory.order.IOrder;
    seller: factory.organization.movieTheater.IOrganization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    return new Promise<factory.creativeWork.message.email.ICreativeWork>((resolve, reject) => {
        const seller = params.transaction.seller;

        pug.renderFile(
            `${__dirname}/../../../emails/refundOrder/text.pug`,
            {
                familyName: params.customerContact.familyName,
                givenName: params.customerContact.givenName,
                confirmationNumber: params.order.confirmationNumber,
                price: params.order.price,
                sellerName: params.order.seller.name,
                sellerTelephone: params.seller.telephone
            },
            (renderMessageErr, message) => {
                if (renderMessageErr instanceof Error) {
                    reject(renderMessageErr);

                    return;
                }

                debug('message:', message);
                pug.renderFile(
                    `${__dirname}/../../../emails/refundOrder/subject.pug`,
                    {
                        sellerName: params.order.seller.name
                    },
                    (renderSubjectErr, subject) => {
                        if (renderSubjectErr instanceof Error) {
                            reject(renderSubjectErr);

                            return;
                        }

                        debug('subject:', subject);

                        const email: factory.creativeWork.message.email.ICreativeWork = {
                            typeOf: factory.creativeWorkType.EmailMessage,
                            identifier: `refundOrder-${params.order.orderNumber}`,
                            name: `refundOrder-${params.order.orderNumber}`,
                            sender: {
                                typeOf: seller.typeOf,
                                name: seller.name.ja,
                                email: 'noreply@ticket-cinemasunshine.com'
                            },
                            toRecipient: {
                                typeOf: params.transaction.agent.typeOf,
                                name: `${params.customerContact.familyName} ${params.customerContact.givenName}`,
                                email: params.customerContact.email
                            },
                            about: subject,
                            text: message
                        };
                        resolve(email);
                    }
                );
            }
        );
    });
}

/**
 * 返品取引のタスクをエクスポートする
 */
export function exportTasks(status: factory.transactionStatusType) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks(factory.transactionType.ReturnOrder, status);
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById({ transactionId: transaction.id })(repos);

        await repos.transaction.setTasksExportedById(transaction.id);
    };
}

/**
 * ID指定で取引のタスク出力
 */
export function exportTasksById(params: { transactionId: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById(factory.transactionType.ReturnOrder, params.transactionId);
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
                        transactionId: transaction.id
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
