import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import * as NotificationService from '../notification';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.TriggerWebhook>): IOperation<void> {
    return async (_: IConnectionSettings) => {
        await NotificationService.triggerWebhook(data)();
    };
}
