/**
 * 注文返品取引サービス
 */
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
// import { MongoRepository as OrganizationRepo } from '../../repo/organization';
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
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const seller = await repos.seller.findById({ id: params.seller.id });

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
                    throw new factory.errors.Argument('Order number', 'Already returned');
                }
            }

            throw error;
        }

        // Chevre予約の場合、予約キャンセル取引開始する？
        // いったん保留中
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

        await repos.transaction.transactionModel.findByIdAndUpdate(
            returnOrderTransaction.id,
            { 'object.pendingCancelReservationTransactions': pendingCancelReservationTransactions }
        )
            .exec();

        return returnOrderTransaction;
    };
}

/**
 * 取引確定
 */
export function confirm(params: factory.transaction.returnOrder.IConfirmParams) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        seller: SellerRepo;
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

        const order = transaction.object.order;
        const seller = await repos.seller.findById(
            { id: order.seller.id },
            { paymentAccepted: 0 } // 決済情報は不要
        );

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            limit: 1,
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });

        const result: factory.transaction.returnOrder.IResult = {};
        const potentialActions = await createPotentialActions({
            actionsOnOrder: actionsOnOrder,
            potentialActions: params.potentialActions,
            seller: seller,
            transaction: transaction,
            placeOrderTransaction: placeOrderTransaction
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
 * 返品取引のタスクをエクスポートする
 */
export function exportTasks(params: {
    project?: factory.project.IProject;
    status: factory.transactionStatusType;
}) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: factory.transactionType.ReturnOrder,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        const tasks = await exportTasksById(transaction)(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}

/**
 * 取引のタスクを出力します
 * 複数タスクが生成されます
 * この関数では、取引のタスクエクスポートステータスは見ません
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
                    project: transaction.project,
                    name: factory.taskName.ReturnOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: transaction.project,
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
