import { IConnectionSettings, IOperation } from '../task';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as ReservationService from '../reservation';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ConfirmReservation>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);

        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const reserveService = new chevre.service.assetTransaction.Reserve({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        await ReservationService.confirmReservation(data)({
            action: actionRepo,
            reserveTransaction: reserveService
        });
    };
}
