// tslint:disable:max-classes-per-file completed-docs
/**
 * repository
 */
import { RedisRepository as AccountNumberRepo } from './repo/accountNumber';
import { MongoRepository as ActionRepo } from './repo/action';
import { RedisRepository as CodeRepo } from './repo/code';
import { RedisRepository as ConfirmationNumberRepo } from './repo/confirmationNumber';
import { MongoRepository as EventRepo } from './repo/event';
import { MongoRepository as InvoiceRepo } from './repo/invoice';
import { MongoRepository as OrderRepo } from './repo/order';
import { RedisRepository as OrderNumberRepo } from './repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from './repo/ownershipInfo';
import { MongoRepository as PaymentMethodRepo } from './repo/paymentMethod';
import { MvtkRepository as MovieTicketRepo } from './repo/paymentMethod/movieTicket';
import { CognitoRepository as PersonRepo } from './repo/person';
import { MongoRepository as ProgramMembershipRepo } from './repo/programMembership';
import { MongoRepository as SellerRepo } from './repo/seller';
import { MongoRepository as TaskRepo } from './repo/task';
import { MongoRepository as TransactionRepo } from './repo/transaction';

/**
 * 口座番号リポジトリ
 */
export class AccountNumber extends AccountNumberRepo { }
/**
 * アクションリポジトリ
 */
export class Action extends ActionRepo { }
export namespace action {
}
/**
 * 所有権コードリポジトリ
 */
export class Code extends CodeRepo { }
/**
 * 確認番号リポジトリ
 */
export class ConfirmationNumber extends ConfirmationNumberRepo { }
/**
 * イベントリポジトリ
 */
export class Event extends EventRepo { }
/**
 * 請求書リポジトリ
 */
export class Invoice extends InvoiceRepo { }
/**
 * 注文リポジトリ
 */
export class Order extends OrderRepo { }
/**
 * 注文番号リポジトリ
 */
export class OrderNumber extends OrderNumberRepo { }
/**
 * 所有権リポジトリ
 */
export class OwnershipInfo extends OwnershipInfoRepo { }
/**
 * 決済方法リポジトリ
 */
export class PaymentMethod extends PaymentMethodRepo { }
export namespace paymentMethod {
    /**
     * ムビチケリポジトリ
     */
    export class MovieTicket extends MovieTicketRepo { }
}
/**
 * 顧客リポジトリ
 */
export class Person extends PersonRepo { }
/**
 * 会員プログラムリポジトリ
 */
export class ProgramMembership extends ProgramMembershipRepo { }
/**
 * 販売者リポジトリ
 */
export class Seller extends SellerRepo { }
/**
 * タスクリポジトリ
 */
export class Task extends TaskRepo { }
/**
 * 取引リポジトリ
 */
export class Transaction extends TransactionRepo { }
export namespace itemAvailability {
}
