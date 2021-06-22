import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as ProductService from '../product';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ConfirmRegisterService>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const registerService = new chevre.service.assetTransaction.RegisterService({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        await ProductService.registerService(data)({
            action: new ActionRepo(settings.connection),
            registerServiceTransaction: registerService,
            task: new TaskRepo(settings.connection)
        });
    };
}
