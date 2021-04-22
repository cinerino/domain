import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OrderService from '../order';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ReturnOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const ownershipInfoRepo = new OwnershipInfoRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        await OrderService.returnOrder(data)({
            action: actionRepo,
            ownershipInfo: ownershipInfoRepo,
            transaction: transactionRepo,
            task: taskRepo
        });
    };
}
