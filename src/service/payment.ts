/**
 * 決済サービス
 */
import * as AccountPaymentService from './payment/account';
import * as CreditCardPaymentService from './payment/creditCard';
import * as MovieTicketPaymentService from './payment/movieTicket';

export import creditCard = CreditCardPaymentService;
export import account = AccountPaymentService;
export import movietTicket = MovieTicketPaymentService;
