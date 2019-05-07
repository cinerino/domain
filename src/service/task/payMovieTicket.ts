import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.PayMovieTicket>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const eventRepo = new EventRepo(settings.connection);
        const invoiceRepo = new InvoiceRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);
        const sellerRepo = new SellerRepo(settings.connection);

        await PaymentService.movieTicket.payMovieTicket(data)({
            action: actionRepo,
            event: eventRepo,
            invoice: invoiceRepo,
            project: projectRepo,
            seller: sellerRepo
        });
    };
}
