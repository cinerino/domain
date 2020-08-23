/**
 * 決済サービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as InvoiceRepo } from '../repo/invoice';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

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
            case factory.paymentMethodType.Account:
                await AccountPaymentService.payAccount(params)(repos);
                break;

            case factory.paymentMethodType.CreditCard:
                await CreditCardPaymentService.payCreditCard(params)(repos);
                break;

            case factory.paymentMethodType.MGTicket:
            case factory.paymentMethodType.MovieTicket:
                await MovieTicketPaymentService.payMovieTicket(params)(repos);
                break;

            case factory.paymentMethodType.PaymentCard:
                await PaymentCardPaymentService.payPaymentCard(params)(repos);
                break;

            default:
                throw new factory.errors.NotImplemented(`Payment method '${paymentMethodType}' not implemented`);
        }
    };
}

/**
 * 決済中止
 */
export function voidPayment(params: factory.task.IData<factory.taskName.VoidPayment>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        // 決済承認アクションを検索
        let authorizeActions = <factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            });
        authorizeActions = authorizeActions.filter(
            (a) => a.object.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment
        );

        // 承認アクションに存在する決済方法ごとに決済中止処理を実行する
        const paymentMethodTypes = [...new Set(authorizeActions.map((a) => a.object.paymentMethod))];

        for (const paymentMethodType of paymentMethodTypes) {
            switch (paymentMethodType) {
                case factory.paymentMethodType.Account:
                    await AccountPaymentService.voidTransaction(params)(repos);
                    break;

                case factory.paymentMethodType.CreditCard:
                    await CreditCardPaymentService.cancelCreditCardAuth(params)(repos);
                    break;

                case factory.paymentMethodType.MGTicket:
                case factory.paymentMethodType.MovieTicket:
                    // await MovieTicketPaymentService.voidTransaction(params)(repos);
                    break;

                case factory.paymentMethodType.PaymentCard:
                    await PaymentCardPaymentService.voidTransaction(params)(repos);
                    break;

                default:
                // no op
            }
        }
    };
}

/**
 * 返金
 */
export function refund(params: factory.task.IData<factory.taskName.Refund>) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const paymentMethodType = params.object.typeOf;

        switch (paymentMethodType) {
            case factory.paymentMethodType.Account:
                await AccountPaymentService.refundAccount(params)(repos);
                break;

            case factory.paymentMethodType.CreditCard:
                await CreditCardPaymentService.refundCreditCard(params)(repos);
                break;

            case factory.paymentMethodType.MGTicket:
            case factory.paymentMethodType.MovieTicket:
                await MovieTicketPaymentService.refundMovieTicket(params)(repos);
                break;

            case factory.paymentMethodType.PaymentCard:
                await PaymentCardPaymentService.refundPaymentCard(params)(repos);
                break;

            default:
                throw new factory.errors.NotImplemented(`Payment method '${paymentMethodType}' not implemented`);
        }
    };
}
