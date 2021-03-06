import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as ProjectRepo } from '../../repo/project';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.Pay>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const actionRepo = new ActionRepo(settings.connection);
        const invoiceRepo = new InvoiceRepo(settings.connection);
        const projectRepo = new ProjectRepo(settings.connection);

        await PaymentService.pay(data)({
            action: actionRepo,
            invoice: invoiceRepo,
            project: projectRepo
        });
    };
}
