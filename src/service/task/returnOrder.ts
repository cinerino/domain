import { IConnectionSettings, IOperation } from '../task';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OrderService from '../order';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ReturnOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        const chevreAuthClient = new chevre.auth.ClientCredentials({
            domain: credentials.chevre.authorizeServerDomain,
            clientId: credentials.chevre.clientId,
            clientSecret: credentials.chevre.clientSecret,
            scopes: [],
            state: ''
        });

        const orderService = new chevre.service.Order({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const ownershipInfoService = new chevre.service.OwnershipInfo({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        await OrderService.returnOrder(data)({
            action: actionRepo,
            order: orderService,
            ownershipInfo: ownershipInfoService,
            transaction: transactionRepo,
            task: taskRepo
        });
    };
}
