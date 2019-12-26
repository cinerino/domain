import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OrderService from '../order';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.PlaceOrder>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const invoiceRepo = new InvoiceRepo(settings.connection);
        const orderRepo = new OrderRepo(settings.connection);
        const taskRepo = new TaskRepo(settings.connection);
        const transactioinRepo = new TransactionRepo(settings.connection);

        await OrderService.placeOrder(data)({
            action: actionRepo,
            invoice: invoiceRepo,
            order: orderRepo,
            task: taskRepo,
            transaction: transactioinRepo
        });
    };
}
