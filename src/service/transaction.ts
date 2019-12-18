/**
 * 取引サービス
 */
import * as factory from '../factory';

import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as MoneyTransferTransactionService from './transaction/moneyTransfer';
import * as PlaceOrderTransactionService from './transaction/placeOrder';
import * as PlaceOrderInProgressTransactionService from './transaction/placeOrderInProgress';
import * as ReturnOrderTransactionService from './transaction/returnOrder';

export import moneyTransfer = MoneyTransferTransactionService;
export import placeOrder = PlaceOrderTransactionService;
export import placeOrderInProgress = PlaceOrderInProgressTransactionService;
export import returnOrder = ReturnOrderTransactionService;

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks<T extends factory.transactionType>(params: {
    project?: factory.project.IProject;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
    status: factory.transactionStatusType;
    typeOf: T;
}) {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: params.typeOf,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        let tasks: factory.task.ITask<factory.taskName>[] = [];

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        switch (transaction.typeOf) {
            case factory.transactionType.MoneyTransfer:
                tasks = await MoneyTransferTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            case factory.transactionType.PlaceOrder:
                tasks = await PlaceOrderTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            case factory.transactionType.ReturnOrder:
                tasks = await ReturnOrderTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            default:
        }

        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}
