import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as DeliveryService from '../delivery';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.SendOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const registerActionInProgressRepo = new RegisterProgramMembershipInProgressRepo(settings.redisClient);
        const orderRepo = new OrderRepo(settings.connection);
        const ownershipInfoRepo = new OwnershipInfoRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);

        await DeliveryService.sendOrder(data)({
            action: actionRepo,
            order: orderRepo,
            ownershipInfo: ownershipInfoRepo,
            registerActionInProgress: registerActionInProgressRepo,
            task: taskRepo,
            transaction: transactionRepo
        });
    };
}
