import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OfferService from '../offer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.VoidMoneyTransfer>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);

        await OfferService.moneyTransfer.voidTransaction(data)({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });
    };
}
