import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as ProductService from '../product';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ConfirmRegisterService>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await ProductService.registerService(data)({
            action: new ActionRepo(settings.connection),
            task: new TaskRepo(settings.connection)
        });
    };
}
