import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import * as NotificationService from '../notification';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.AnalyzePlaceOrder>): IOperation<void> {
    return async (_: IConnectionSettings) => {
        await NotificationService.triggerWebhook({
            url: `${process.env.TELEMETRY_API_ENDPOINT}/organizations/project/${process.env.PROJECT_ID}/tasks/analyzePlaceOrder`,
            data: data
        })();
    };
}
