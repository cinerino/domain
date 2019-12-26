import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';

import * as ReservationOfferService from '../offer/reservation';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.CancelSeatReservation>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);

        await ReservationOfferService.voidTransaction(data)({
            action: actionRepo,
            project: projectRepo
        });
    };
}
