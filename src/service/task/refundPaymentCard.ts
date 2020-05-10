import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.RefundPaymentCard>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        await PaymentService.paymentCard.refundPaymentCard(data)({
            action: actionRepo,
            project: projectRepo,
            task: taskRepo
        });
    };
}
