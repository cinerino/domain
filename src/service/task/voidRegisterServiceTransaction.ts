import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ProductOfferService from '../offer/product';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.VoidRegisterServiceTransaction>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const registerActionInProgress = new RegisterServiceInProgressRepo(settings.redisClient);
        const transactionRepo = new TransactionRepo(settings.connection);

        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const assetTransactionService = new chevre.service.AssetTransaction({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        await ProductOfferService.voidTransaction(data)({
            action: actionRepo,
            assetTransaction: assetTransactionService,
            registerActionInProgress: registerActionInProgress,
            transaction: transactionRepo
        });
    };
}
