import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.PayMovieTicket>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.mvtkReserveEndpoint === undefined) {
            throw new Error('settings.mvtkReserveEndpoint undefined.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.mvtkReserveAuthClient === undefined) {
            throw new Error('settings.mvtkReserveAuthClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const eventRepo = new EventRepo(settings.connection);
        const invoiceRepo = new InvoiceRepo(settings.connection);
        const organizationRepo = new OrganizationRepo(settings.connection);
        const movieTicketSeatService = new mvtkapi.service.Seat({
            endpoint: settings.mvtkReserveEndpoint,
            auth: settings.mvtkReserveAuthClient
        });
        await PaymentService.movietTicket.payMovieTicket(data)({
            action: actionRepo,
            event: eventRepo,
            invoice: invoiceRepo,
            organization: organizationRepo,
            movieTicketSeatService: movieTicketSeatService
        });
    };
}
