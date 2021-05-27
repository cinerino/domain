/**
 * 注文返品取引サービス
 */
import * as moment from 'moment';

// import { credentials } from '../../credentials';
import { settings } from '../../settings';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { createPotentialActions } from './returnOrder/potentialActions';

import { MongoErrorCode } from '../../errorHandler';

// const chevreAuthClient = new chevre.auth.ClientCredentials({
//     domain: credentials.chevre.authorizeServerDomain,
//     clientId: credentials.chevre.clientId,
//     clientSecret: credentials.chevre.clientSecret,
//     scopes: [],
//     state: ''
// });

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    order: OrderRepo;
    project: ProjectRepo;
    seller: chevre.service.Seller;
    transaction: TransactionRepo;
}) => Promise<T>;

export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 注文返品取引開始
 */
// tslint:disable-next-line:max-func-body-length
export function start(
    params: factory.transaction.returnOrder.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.returnOrder.ITransaction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        project: ProjectRepo;
        seller: chevre.service.Seller;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        const seller = await repos.seller.findById({ id: params.seller.id });

        if (!Array.isArray(params.object.order)) {
            params.object.order = [params.object.order];
        }

        const orders = await repos.order.search({
            project: { id: { $eq: project.id } },
            orderNumbers: params.object.order.map((o) => o.orderNumber),
            seller: { ids: [String(seller.id)] }
        });
        // const orders = searchOrdersResult.data;

        if (orders.length !== params.object.order.length) {
            throw new factory.errors.NotFound('Order');
        }

        await validateOrder({ orders })(repos);

        const appliedReturnPolicy = findApplicableReturnPolicy({
            orders,
            returningDate: now,
            reason: params.object.reason,
            seller: seller
        });

        // let refundFee: number = 0;
        // 返品ポリシーに返品手数料が定義されていれば、プロジェクト設定が必須
        if (typeof appliedReturnPolicy?.returnFees === 'string') {
            const returnFeeByProject = project.settings?.returnFee;
            if (typeof returnFeeByProject !== 'number') {
                throw new factory.errors.NotFound('project.settings.returnFee');
            }
            // refundFee = returnFeeByProject;
        }

        const informOrderParams = createInformOrderParams({
            ...params,
            project: project
        });

        const transactionObject: factory.transaction.returnOrder.IObject = {
            order: orders.map((o) => {
                return { orderNumber: o.orderNumber };
            }),
            // cancellationFee,
            returnPolicy: appliedReturnPolicy,
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
                project: { typeOf: params.project.typeOf, id: params.project.id },
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
                if (error.code === MongoErrorCode.DuplicateKey) {
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
    return async (__: {}) => {
        // 注文ステータスが配送済の場合のみ受け付け
        const allOrdersDelivered = params.orders.every((o) => o.orderStatus === factory.orderStatus.OrderDelivered);
        if (!allOrdersDelivered) {
            throw new factory.errors.Argument('Order Number', 'Invalid Order Status');
        }

        // 決済がある場合、請求書の状態を検証
        // if (order.paymentMethods.length > 0) {
        // }
        // const invoices = await repos.invoice.search({ referencesOrder: { orderNumbers: params.orders.map((o) => o.orderNumber) } });
        // const allPaymentCompleted = invoices.every((invoice) => invoice.paymentStatus === factory.paymentStatusType.PaymentComplete);
        // if (!allPaymentCompleted) {
        //     throw new factory.errors.Argument('Order Number', 'Payment not completed');
        // }
    };
}

/**
 * 販売者の返品ポリシーを確認する
 */
function findApplicableReturnPolicy(params: {
    orders: factory.order.IOrder[];
    returningDate: Date;
    reason: factory.transaction.returnOrder.Reason;
    seller: factory.seller.ISeller;
}): factory.chevre.merchantReturnPolicy.IMerchantReturnPolicy {
    if (params.reason === factory.transaction.returnOrder.Reason.Seller) {
        // 販売者都合の場合、手数料なしの無制限返品ポリシーを適用
        return {
            typeOf: 'MerchantReturnPolicy',
            refundType: factory.chevre.merchantReturnPolicy.RefundTypeEnumeration.FullRefund
        };
    }

    let returnPolicies = params.seller.hasMerchantReturnPolicy;
    if (!Array.isArray(returnPolicies)) {
        returnPolicies = [];
    }

    const returningDate = moment(params.returningDate);

    const applicalbleReturnPolicies: factory.chevre.organization.IHasMerchantReturnPolicy = [];
    if (params.reason === factory.transaction.returnOrder.Reason.Customer) {
        returnPolicies.forEach((returnPolicy) => {
            const merchantReturnDays = returnPolicy.merchantReturnDays;
            if (typeof merchantReturnDays === 'number') {
                // 返品適用日数を確認する
                const everyOrderApplicable = params.orders.every((order) => {
                    const mustBeReturnedUntil = moment(order.orderDate)
                        .add(merchantReturnDays, 'days');

                    return mustBeReturnedUntil.isSameOrAfter(returningDate);

                });

                // 全注文について日数の確認ができれば適用
                if (everyOrderApplicable) {
                    applicalbleReturnPolicies.push(returnPolicy);
                }
            } else {
                // 日数制限なし
                applicalbleReturnPolicies.push(returnPolicy);
            }

        });
    }

    if (applicalbleReturnPolicies.length === 0) {
        throw new factory.errors.Argument('Seller', 'has no applicable return policies');
    }

    return applicalbleReturnPolicies[0];
}

function createInformOrderParams(params: factory.transaction.returnOrder.IStartParamsWithoutDetail & {
    project: factory.project.IProject;
}): factory.transaction.returnOrder.IInformOrderParams[] {
    const informOrderParamsByGlobalSettings = settings.onOrderStatusChanged?.informOrder;
    const informOrderParamsByProject = params.project.settings?.onOrderStatusChanged?.informOrder;
    const informOrderParamsByTransaction = params.object?.onOrderStatusChanged?.informOrder;

    return [
        ...(Array.isArray(informOrderParamsByGlobalSettings)) ? informOrderParamsByGlobalSettings : [],
        ...(Array.isArray(informOrderParamsByProject)) ? informOrderParamsByProject : [],
        ...(Array.isArray(informOrderParamsByTransaction)) ? informOrderParamsByTransaction : []
    ];
}

/**
 * 取引確定
 */
export function confirm(params: factory.transaction.returnOrder.IConfirmParams) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
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
        // const orders = searchOrdersResult.data;

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
