import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.RefundCreditCard>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);
        await PaymentService.creditCard.refundCreditCard(data)({
            action: actionRepo,
            task: taskRepo
        });
    };
}
