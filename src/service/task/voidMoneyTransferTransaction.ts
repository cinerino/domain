import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OfferService from '../offer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.VoidMoneyTransferTransaction>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);

        await OfferService.monetaryAmount.voidTransaction(data)({
            action: actionRepo,
            transaction: transactionRepo
        });
    };
}
