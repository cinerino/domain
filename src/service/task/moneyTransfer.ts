import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';

import * as OfferService from '../offer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.MoneyTransfer>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);

        await OfferService.monetaryAmount.settleTransaction(data)({
            action: actionRepo,
            project: projectRepo
        });
    };
}
