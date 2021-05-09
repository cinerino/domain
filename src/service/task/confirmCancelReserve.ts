import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';

import * as ReservationService from '../reservation';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ConfirmCancelReserve>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);

        await ReservationService.cancelReservation(data)({
            action: actionRepo
        });
    };
}
