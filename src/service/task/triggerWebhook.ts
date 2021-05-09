import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as NotificationService from '../notification';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.TriggerWebhook>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        await NotificationService.triggerWebhook(data)({ action: actionRepo });
    };
}
