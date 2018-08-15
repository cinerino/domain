/**
 * 決済サービス
 */
import * as CreditCardPaymentService from './payment/creditCard';
import * as MocoinPaymentService from './payment/mocoin';
import * as PecorinoPaymentService from './payment/pecorino';

export import creditCard = CreditCardPaymentService;
export import mocoin = MocoinPaymentService;
export import pecorino = PecorinoPaymentService;
