/**
 * 決済サービス
 */
import * as AccountPaymentService from './payment/account';
import * as AnyPaymentService from './payment/any';
import * as CreditCardPaymentService from './payment/creditCard';
import * as MovieTicketPaymentService from './payment/movieTicket';

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
export import movietTicket = MovieTicketPaymentService;
