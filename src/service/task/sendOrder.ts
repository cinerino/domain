import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as DeliveryService from '../delivery';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.SendOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const orderRepo = new OrderRepo(settings.connection);
        const ownershipInfoRepo = new OwnershipInfoRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        await DeliveryService.sendOrder(data)({
            action: actionRepo,
            order: orderRepo,
            ownershipInfo: ownershipInfoRepo,
            task: taskRepo
        });
    };
}
