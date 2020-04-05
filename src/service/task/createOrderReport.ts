import { IConnectionSettings, IOperation } from '../task';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as OrderReportService from '../report/order';

/**
 * タスク実行関数
 */
export function call(data: OrderReportService.ICreateReportActionAttributes): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const orderRepo = new OrderRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);

        await OrderReportService.createReport(data)({
            action: actionRepo,
            order: orderRepo,
            task: taskRepo
        });
    };
}
