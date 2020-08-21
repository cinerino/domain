/**
 * 決済サービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as InvoiceRepo } from '../repo/invoice';
import { MongoRepository as ProjectRepo } from '../repo/project';

import * as AccountPaymentService from './payment/account';
import * as AnyPaymentService from './payment/any';
import * as CreditCardPaymentService from './payment/creditCard';
import * as MovieTicketPaymentService from './payment/movieTicket';
import * as PaymentCardPaymentService from './payment/paymentCard';

import * as factory from '../factory';

/**
 * 口座決済
 */
export import account = AccountPaymentService;

/**
 * 汎用決済
 */
export import any = AnyPaymentService;

/**
 * クレジットカード決済
 */
export import creditCard = CreditCardPaymentService;

/**
 * ムビチケ決済
 */
export import movieTicket = MovieTicketPaymentService;

/**
 * 決済カード決済
 */
export import paymentCard = PaymentCardPaymentService;

/**
 * 決済
 */
export function pay(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }) => {
        const paymentMethodType = params.object[0]?.paymentMethod.typeOf;

        switch (paymentMethodType) {
            case factory.paymentMethodType.CreditCard:
                await CreditCardPaymentService.payCreditCard(params)(repos);
                break;

            case factory.paymentMethodType.MGTicket:
            case factory.paymentMethodType.MovieTicket:
                await MovieTicketPaymentService.payMovieTicket(params)(repos);
                break;

            default:
                throw new factory.errors.NotImplemented(`Payment method '${paymentMethodType}' not implemented`);
        }
    };
}
