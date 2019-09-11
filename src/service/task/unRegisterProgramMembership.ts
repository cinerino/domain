import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as ProgramMembershipService from '../programMembership';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.UnRegisterProgramMembership>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await ProgramMembershipService.unRegister(data)({
            action: new ActionRepo(settings.connection),
            ownershipInfo: new OwnershipInfoRepo(settings.connection),
            task: new TaskRepo(settings.connection)
        });
    };
}
