import { IConnectionSettings, IOperation } from '../task';

import * as chevre from '../../chevre';
import * as factory from '../../factory';
import { RedisRepository as EventAttendeeCapacityRepo } from '../../repo/event/attendeeCapacity';

import * as StockService from '../stock';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.UpdateEventAttendeeCapacity>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }
        if (settings.chevreEndpoint === undefined) {
            throw new Error('settings.chevreEndpoint undefined.');
        }
        if (settings.chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined.');
        }

        const attendeeCapacityRepo = new EventAttendeeCapacityRepo(settings.redisClient);
        const eventService = new chevre.service.Event({
            endpoint: settings.chevreEndpoint,
            auth: settings.chevreAuthClient
        });

        await StockService.updateEventAttendeeCapacity(data)({
            attendeeCapacity: attendeeCapacityRepo,
            eventService: eventService
        });
    };
}
