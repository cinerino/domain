import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';

import * as StockService from '../stock';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ImportScreeningEvents>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const eventRepo = new EventRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);
        const sellerRepo = new SellerRepo(settings.connection);

        await StockService.importScreeningEvents(data)({
            event: eventRepo,
            project: projectRepo,
            seller: sellerRepo
        });
    };
}
