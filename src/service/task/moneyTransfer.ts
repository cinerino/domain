import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as OfferService from '../offer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.MoneyTransfer>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);

        await OfferService.monetaryAmount.settleTransaction(data)({
            action: actionRepo
        });
    };
}
