import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { RedisRepository as EventAttendeeCapacityRepo } from '../../repo/event/attendeeCapacity';
import { MongoRepository as ProjectRepo } from '../../repo/project';

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

        const attendeeCapacityRepo = new EventAttendeeCapacityRepo(settings.redisClient);
        const projectRepo = new ProjectRepo(settings.connection);

        await StockService.updateEventAttendeeCapacity(data)({
            attendeeCapacity: attendeeCapacityRepo,
            project: projectRepo
        });
    };
}
