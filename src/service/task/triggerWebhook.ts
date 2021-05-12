import { service } from '@chevre/domain';
import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.TriggerWebhook>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        await service.notification.triggerWebhook(data)({ action: actionRepo });
    };
}
