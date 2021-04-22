import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OrderService from '../order';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.PlaceOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);
        const transactioinRepo = new TransactionRepo(settings.connection);

        await OrderService.placeOrder(data)({
            action: actionRepo,
            task: taskRepo,
            transaction: transactioinRepo
        });
    };
}
