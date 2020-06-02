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

        if (!Array.isArray(params.object.order)) {
            params.object.order = [params.object.order];
        }

        const orders = await repos.order.search({
            project: { id: { $eq: project.id } },
            orderNumbers: params.object.order.map((o) => o.orderNumber),
            seller: { ids: [seller.id] }
        });

        if (orders.length !== params.object.order.length) {
            throw new factory.errors.NotFound('Order');
        }

        await validateOrder({ orders })(repos);

        checkReturnPolicy({
            reason: params.object.reason,
            seller: seller
        });

        const informOrderParams = createInformOrderParams({
            ...params,
            project: project
        });

        const transactionObject: factory.transaction.returnOrder.IObject = {
            order: orders.map((o) => {
                return { orderNumber: o.orderNumber };
            }),
            cancellationFee: params.object.cancellationFee,
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

        return returnOrderTransaction;
    };
}

function validateOrder(params: {
    orders: factory.order.IOrder[];
}) {
    return async (repos: {
        invoice: InvoiceRepo;
    }) => {
        // 注文ステータスが配送済の場合のみ受け付け
        const allOrdersDelivered = params.orders.every((o) => o.orderStatus === factory.orderStatus.OrderDelivered);
        if (!allOrdersDelivered) {
            throw new factory.errors.Argument('Order Number', 'Invalid Order Status');
        }

        // 決済がある場合、請求書の状態を検証
        // if (order.paymentMethods.length > 0) {
        // }
        const invoices = await repos.invoice.search({ referencesOrder: { orderNumbers: params.orders.map((o) => o.orderNumber) } });
        const allPaymentCompleted = invoices.every((invoice) => invoice.paymentStatus === factory.paymentStatusType.PaymentComplete);
        if (!allPaymentCompleted) {
            throw new factory.errors.Argument('Order Number', 'Payment not completed');
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

        if (typeof params.agent?.id === 'string' && transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const orderNumbers: string[] = transaction.object.order.map((o) => o.orderNumber);

        const orders = await repos.order.search({
            project: { id: { $eq: transaction.project.id } },
            orderNumbers: orderNumbers
        });

        const result: factory.transaction.returnOrder.IResult = {};
        const potentialActions = await createPotentialActions({
            orders: orders,
            potentialActions: params.potentialActions,
            transaction: transaction
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
