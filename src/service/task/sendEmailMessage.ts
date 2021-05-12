import { service } from '@chevre/domain';
import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.SendEmailMessage>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await service.notification.sendEmailMessage(data.actionAttributes)({
            action: new ActionRepo(settings.connection),
            project: new ProjectRepo(settings.connection)
        });
    };
}
