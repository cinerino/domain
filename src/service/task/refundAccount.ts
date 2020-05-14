import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as MoneyTransferTransactionNumberRepo } from '../../repo/moneyTransferTransactionNumber';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.RefundAccount>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        await PaymentService.account.refundAccount(data)({
            action: actionRepo,
            moneyTransferTransactionNumber: new MoneyTransferTransactionNumberRepo(settings.redisClient),
            project: projectRepo,
            task: taskRepo
        });
    };
}
