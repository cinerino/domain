/**
 * 注文返品取引サービス
 */
import * as moment from 'moment';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { createPotentialActions } from './returnOrder/potentialActions';

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    invoice: InvoiceRepo;
    order: OrderRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type ITaskAndTransactionOperation<T> = (repos: {
    project: ProjectRepo;
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
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        const seller = await repos.seller.findById({ id: params.seller.id });
        const order = await repos.order.findByOrderNumber({ orderNumber: params.object.order.orderNumber });

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

        await validateOrder({ order })(repos);

        checkReturnPolicy({
            reason: params.object.reason,
            seller: seller
        });

        const informOrderParams = createInformOrderParams({
            ...params,
            project: project
        });

        const transactionObject: factory.transaction.returnOrder.IObject = {
            order: order,
            cancellationFee: params.object.cancellationFee,
            pendingCancelReservationTransactions: [],
            reason: params.object.reason,
            onOrderStatusChanged: {
                informOrder: informOrderParams
            }
        };

        const returnOrderAttributes: factory.transaction.IStartParams<factory.transactionType.ReturnOrder> = {
            project: params.project,
            typeOf: factory.transactionType.ReturnOrder,
            agent: params.agent,
            seller: {
                project: params.project,
                id: seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            object: transactionObject,
            expires: params.expires
        };

        let returnOrderTransaction: factory.transaction.returnOrder.ITransaction;
        try {
            returnOrderTransaction = await repos.transaction.start<factory.transactionType.ReturnOrder>(returnOrderAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 同一取引に対して返品取引を作成しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.Argument('Order number', 'Already returned');
                }
            }

            throw error;
        }

        // Chevre予約の場合、予約キャンセル取引開始する？
        // いったん保留中
        const pendingCancelReservationTransactions = await startCancelReservation({ placeOrderTransaction: placeOrderTransaction });
        await repos.transaction.transactionModel.findByIdAndUpdate(
            returnOrderTransaction.id,
            { 'object.pendingCancelReservationTransactions': pendingCancelReservationTransactions }
        )
            .exec();

        return returnOrderTransaction;
    };
}

function validateOrder(params: {
    order: factory.order.IOrder;
}) {
    return async (repos: {
        invoice: InvoiceRepo;
    }) => {
        const order = params.order;

        // 注文ステータスが配送済の場合のみ受け付け
        if (order.orderStatus !== factory.orderStatus.OrderDelivered) {
            throw new factory.errors.Argument('Order Number', `Invalid Order Status: ${order.orderStatus}`);
        }

        // 決済がある場合、請求書の状態を検証
        if (order.paymentMethods.length > 0) {
            const invoices = await repos.invoice.search({ referencesOrder: { orderNumbers: [order.orderNumber] } });
            const allPaymentCompleted = invoices.every((invoice) => invoice.paymentStatus === factory.paymentStatusType.PaymentComplete);
            if (!allPaymentCompleted) {
                throw new factory.errors.Argument('order.orderNumber', 'Payment not completed');
            }
        }
    };
}

/**
 * 販売者の返品ポリシーを確認する
 */
function checkReturnPolicy(
    params: {
        reason: factory.transaction.returnOrder.Reason;
        seller: factory.seller.IOrganization<any>;
    }) {
    let returnPolicies = params.seller.hasMerchantReturnPolicy;
    if (!Array.isArray(returnPolicies)) {
        returnPolicies = [];
    }

    if (params.reason === factory.transaction.returnOrder.Reason.Customer) {
        if (returnPolicies.length === 0) {
            throw new factory.errors.Argument('Seller', 'has no return policy');
        }
    }
}

function createInformOrderParams(
    params: factory.transaction.returnOrder.IStartParamsWithoutDetail
): factory.transaction.returnOrder.IInformOrderParams[] {
    const project = params.project;

    const informOrderParams: factory.transaction.returnOrder.IInformOrderParams[] = [];

    if (project.settings !== undefined
        && project.settings !== null
        && project.settings.onOrderStatusChanged !== undefined
        && Array.isArray(project.settings.onOrderStatusChanged.informOrder)) {
        informOrderParams.push(...project.settings.onOrderStatusChanged.informOrder);
    }

    if (params.object !== undefined
        && params.object.onOrderStatusChanged !== undefined
        && Array.isArray(params.object.onOrderStatusChanged.informOrder)) {
        informOrderParams.push(...params.object.onOrderStatusChanged.informOrder);
    }

    return informOrderParams;
}

async function startCancelReservation(params: {
    placeOrderTransaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
}): Promise<factory.chevre.transaction.cancelReservation.ITransaction[]> {
    const pendingCancelReservationTransactions: factory.chevre.transaction.cancelReservation.ITransaction[] = [];
    const authorizeSeatReservationActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
        params.placeOrderTransaction.object.authorizeActions
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

            // 予約キャンセル取引開始は保留

            // pendingCancelReservationTransactions.push(await repos.cancelReservationService.start({
            //     typeOf: factory.chevre.transactionType.CancelReservation,
            //     agent: {
            //         typeOf: returnOrderTransaction.agent.typeOf,
            //         id: returnOrderTransaction.agent.id,
            //         name: order.customer.name
            //     },
            //     object: {
            //         transaction: {
            //             typeOf: responseBody.typeOf,
            //             id: responseBody.id
            //         }
            //     },
            //     expires: moment(params.expires)
            //         .add(1, 'month')
            //         .toDate() // 余裕を持って
            // }));
        }
    }

    return pendingCancelReservationTransactions;
}

/**
 * 取引確定
 */
export function confirm(params: factory.transaction.returnOrder.IConfirmParams) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
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

        if (params.agent !== undefined && params.agent.id !== undefined) {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        const order = await repos.order.findByOrderNumber({ orderNumber: transaction.object.order.orderNumber });

        // const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
        //     limit: 1,
        //     typeOf: factory.transactionType.PlaceOrder,
        //     result: {
        //         order: { orderNumbers: [order.orderNumber] }
        //     }
        // });
        // const placeOrderTransaction = placeOrderTransactions.shift();
        // if (placeOrderTransaction === undefined) {
        //     throw new factory.errors.NotFound('Transaction');
        // }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });

        const result: factory.transaction.returnOrder.IResult = {};
        const potentialActions = await createPotentialActions({
            actionsOnOrder: actionsOnOrder,
            order: order,
            potentialActions: params.potentialActions,
            transaction: transaction
            // placeOrderTransaction: placeOrderTransaction
        });

        // ステータス変更
        transaction = await repos.transaction.confirm({
            typeOf: transaction.typeOf,
            id: transaction.id,
            authorizeActions: [],
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
 * 取引のタスクを出力します
 * 複数タスクが生成されます
 * この関数では、取引のタスクエクスポートステータスは見ません
 */
export function exportTasksById(params: {
    id: string;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
}): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // タスク実行日時バッファの指定があれば調整
        let taskRunsAt = new Date();
        if (typeof params.runsTasksAfterInSeconds === 'number') {
            taskRunsAt = moment(taskRunsAt)
                .add(params.runsTasksAfterInSeconds, 'seconds')
                .toDate();
        }

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                const returnOrderPotentialActions = transaction.potentialActions?.returnOrder;
                if (Array.isArray(returnOrderPotentialActions)) {
                    // 注文返品タスク
                    const returnOrderTask: factory.task.IAttributes<factory.taskName.ReturnOrder>[]
                        = returnOrderPotentialActions.map((r) => {
                            return {
                                project: transaction.project,
                                name: factory.taskName.ReturnOrder,
                                status: factory.taskStatus.Ready,
                                runsAt: taskRunsAt,
                                remainingNumberOfTries: 10,
                                numberOfTried: 0,
                                executionResults: [],
                                data: r
                            };
                        });
                    taskAttributes.push(...returnOrderTask);
                }

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

/**
 * 確定取引についてメールを送信する(ttts専用)
 * @deprecated
 */
// export function sendEmail(
//     transactionId: string,
//     emailMessageAttributes: factory.creativeWork.message.email.IAttributes
// ) {
//     return async (repos: {
//         order: OrderRepo;
//         task: TaskRepo;
//         transaction: TransactionRepo;
//     }): Promise<factory.task.ITask<factory.taskName.SendEmailMessage>> => {
//         const returnOrderTransaction: factory.transaction.returnOrder.ITransaction = <any>
//             await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: transactionId });
//         if (returnOrderTransaction.status !== factory.transactionStatusType.Confirmed) {
//             throw new factory.errors.Forbidden('Transaction not confirmed.');
//         }

//         // const placeOrderTransaction = returnOrderTransaction.object.transaction;
//         // if (placeOrderTransaction.result === undefined) {
//         //     throw new factory.errors.NotFound('PlaceOrder Transaction Result');
//         // }
//         const order = await repos.order.findByOrderNumber({ orderNumber: returnOrderTransaction.object.order.orderNumber });

//         const emailMessage: factory.creativeWork.message.email.ICreativeWork = {
//             typeOf: factory.creativeWorkType.EmailMessage,
//             identifier: `returnOrderTransaction-${transactionId}`,
//             name: `returnOrderTransaction-${transactionId}`,
//             sender: {
//                 typeOf: order.seller.typeOf,
//                 name: emailMessageAttributes.sender.name,
//                 email: emailMessageAttributes.sender.email
//             },
//             toRecipient: {
//                 typeOf: order.customer.typeOf,
//                 name: emailMessageAttributes.toRecipient.name,
//                 email: emailMessageAttributes.toRecipient.email
//             },
//             about: emailMessageAttributes.about,
//             text: emailMessageAttributes.text
//         };

//         // その場で送信ではなく、DBにタスクを登録
//         const taskAttributes: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
//             name: factory.taskName.SendEmailMessage,
//             project: returnOrderTransaction.project,
//             status: factory.taskStatus.Ready,
//             runsAt: new Date(), // なるはやで実行
//             remainingNumberOfTries: 10,
//             numberOfTried: 0,
//             executionResults: [],
//             data: {
//                 actionAttributes: {
//                     agent: {
//                         id: order.seller.id,
//                         name: { ja: order.seller.name, en: '' },
//                         project: returnOrderTransaction.project,
//                         typeOf: order.seller.typeOf
//                     },
//                     object: emailMessage,
//                     project: returnOrderTransaction.project,
//                     purpose: {
//                         typeOf: order.typeOf,
//                         orderNumber: order.orderNumber
//                     },
//                     recipient: {
//                         id: order.customer.id,
//                         name: order.customer.name,
//                         typeOf: order.customer.typeOf
//                     },
//                     typeOf: factory.actionType.SendAction
//                 }
//                 // transactionId: transactionId,
//                 // emailMessage: emailMessage
//             }
//         };

//         return <any>await repos.task.save(taskAttributes);
//     };
// }
