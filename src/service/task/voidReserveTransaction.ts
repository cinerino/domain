import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as ReservationOfferService from '../offer/reservation';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.VoidReserveTransaction>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);

        await ReservationOfferService.voidTransaction(data)({
            action: actionRepo
        });
    };
}
