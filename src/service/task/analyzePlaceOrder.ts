import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as TelemetryRepo } from '../../repo/telemetry';

import * as TelemetryService from '../report/telemetry';

export const taskName: any = 'analyzePlaceOrder';
/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<typeof taskName>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const telemetryRepo = new TelemetryRepo(settings.connection);
        await TelemetryService.analyzePlaceOrder(data)({
            telemetry: telemetryRepo
        });
    };
}
