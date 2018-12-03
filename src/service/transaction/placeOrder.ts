/**
 * 注文取引サービス
 */
import * as createDebug from 'debug';

import * as factory from '../../factory';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks(status: factory.transactionStatusType) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({ typeOf: factory.transactionType.PlaceOrder, status: status });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById({ transactionId: transaction.id })(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });
    };
}

/**
 * ID指定で取引のタスク出力
 */
export function exportTasksById(params: { transactionId: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // ウェブフックタスクを追加
        const webhookUrl =
            // tslint:disable-next-line:max-line-length
            `${process.env.TELEMETRY_API_ENDPOINT}/organizations/project/${process.env.PROJECT_ID}/tasks/analyzePlaceOrder`;
        const triggerWebhookTaskAttributes: factory.task.IAttributes<factory.taskName.TriggerWebhook> = {
            name: factory.taskName.TriggerWebhook,
            status: factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 3,
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: {
                url: webhookUrl,
                payload: { transaction: transaction }
            }
        };
        taskAttributes.push(
            triggerWebhookTaskAttributes
        );

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                const transactionResult = transaction.result;
                if (transactionResult === undefined) {
                    throw new factory.errors.NotFound('Transaction Result');
                }
                const potentialActions = transaction.potentialActions;
                if (potentialActions === undefined) {
                    throw new factory.errors.NotFound('Transaction PotentialActions');
                }
                const orderActionAttributes = potentialActions.order;
                const placeOrderTaskAttributes: factory.task.IAttributes<factory.taskName.PlaceOrder> = {
                    name: factory.taskName.PlaceOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: orderActionAttributes
                };
                taskAttributes.push(
                    placeOrderTaskAttributes
                );
                break;

            // 期限切れor中止の場合は、タスクリストを作成する
            case factory.transactionStatusType.Canceled:
            case factory.transactionStatusType.Expired:
                const cancelSeatReservationTaskAttributes: factory.task.IAttributes<factory.taskName.CancelSeatReservation> = {
                    name: factory.taskName.CancelSeatReservation,
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
                const cancelCreditCardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelCreditCard> = {
                    name: factory.taskName.CancelCreditCard,
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
                const cancelAccountTaskAttributes: factory.task.IAttributes<factory.taskName.CancelAccount> = {
                    name: factory.taskName.CancelAccount,
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
                const cancelPointAwardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelPointAward> = {
                    name: factory.taskName.CancelPointAward,
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
                taskAttributes.push(
                    cancelSeatReservationTaskAttributes,
                    cancelCreditCardTaskAttributes,
                    cancelAccountTaskAttributes,
                    cancelPointAwardTaskAttributes
                );
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }
        debug('taskAttributes prepared', taskAttributes);

        return Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
