import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as DeliveryService from '../delivery';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.GivePointAward>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        const depositTransaction = new chevre.service.accountTransaction.Deposit({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        await DeliveryService.givePointAward(data)({
            action: new ActionRepo(settings.connection),
            depositTransaction,
            transactionNumber: transactionNumberService
        });
    };
}
