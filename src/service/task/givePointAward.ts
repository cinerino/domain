import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';

import * as DeliveryService from '../delivery';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.GivePointAward>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await DeliveryService.givePointAward(data)({
            action: new ActionRepo(settings.connection),
            project: new ProjectRepo(settings.connection)
        });
    };
}
