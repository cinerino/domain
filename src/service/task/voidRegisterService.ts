import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ProductOfferService from '../offer/product';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.VoidRegisterService>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const registerActionInProgress = new RegisterServiceInProgressRepo(settings.redisClient);
        const transactionRepo = new TransactionRepo(settings.connection);

        await ProductOfferService.voidTransaction(data)({
            action: actionRepo,
            registerActionInProgress: registerActionInProgress,
            transaction: transactionRepo
        });
    };
}
