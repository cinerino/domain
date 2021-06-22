import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as OfferService from '../offer';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ConfirmMoneyTransfer>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);

        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const depositTransaction = new chevre.service.accountTransaction.Deposit({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        const transferTransaction = new chevre.service.accountTransaction.Transfer({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        const withdrawTransaction = new chevre.service.accountTransaction.Withdraw({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        await OfferService.monetaryAmount.settleTransaction(data)({
            action: actionRepo,
            depositTransaction,
            transferTransaction,
            withdrawTransaction
        });
    };
}
