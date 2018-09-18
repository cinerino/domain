import { IConnectionSettings, IOperation } from '../task';

import * as chevre from '../../chevre';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OrderService from '../order';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.ReturnOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        if (settings.chevreEndpoint === undefined) {
            throw new Error('settings.chevreEndpoint undefined.');
        }
        if (settings.chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const orderRepo = new OrderRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);
        const cancelReservationService = new chevre.service.transaction.CancelReservation({
            endpoint: settings.chevreEndpoint,
            auth: settings.chevreAuthClient
        });
        await OrderService.cancelReservations(data)({
            action: actionRepo,
            order: orderRepo,
            transaction: transactionRepo,
            task: taskRepo,
            cancelReservationService: cancelReservationService
        });
    };
}
