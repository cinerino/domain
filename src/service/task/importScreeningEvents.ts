import { IConnectionSettings, IOperation } from '../task';

import * as chevre from '../../chevre';
import * as factory from '../../factory';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as SellerRepo } from '../../repo/seller';

import * as StockService from '../stock';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ImportScreeningEvents>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        if (settings.chevreEndpoint === undefined) {
            throw new Error('settings.chevreEndpoint undefined.');
        }
        if (settings.chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined.');
        }

        const eventRepo = new EventRepo(settings.connection);
        const sellerRepo = new SellerRepo(settings.connection);
        const eventService = new chevre.service.Event({
            endpoint: settings.chevreEndpoint,
            auth: settings.chevreAuthClient
        });

        await StockService.importScreeningEvents(data)({
            event: eventRepo,
            seller: sellerRepo,
            eventService: eventService
        });
    };
}
