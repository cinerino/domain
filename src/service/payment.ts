/**
 * 決済サービス
 */
import * as AccountPaymentService from './payment/account';
import * as CreditCardPaymentService from './payment/creditCard';
import * as MocoinPaymentService from './payment/mocoin';

export import creditCard = CreditCardPaymentService;
export import mocoin = MocoinPaymentService;
export import account = AccountPaymentService;
