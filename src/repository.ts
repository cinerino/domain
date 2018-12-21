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
import { MongoRepository as OrganizationRepo } from './repo/organization';
import { MongoRepository as OwnershipInfoRepo } from './repo/ownershipInfo';
import { MongoRepository as PaymentMethodRepo } from './repo/paymentMethod';
import { MvtkRepository as MovieTicketRepo } from './repo/paymentMethod/movieTicket';
import { CognitoRepository as PersonRepo } from './repo/person';
import { MongoRepository as ProgramMembershipRepo } from './repo/programMembership';
import { MongoRepository as SellerRepo } from './repo/seller';
import { MongoRepository as TaskRepo } from './repo/task';
import { MongoRepository as TransactionRepo } from './repo/transaction';

export class AccountNumber extends AccountNumberRepo { }
export class Action extends ActionRepo { }
export namespace action {
}
export class Code extends CodeRepo { }
export class ConfirmationNumber extends ConfirmationNumberRepo { }
export class Event extends EventRepo { }
export class Invoice extends InvoiceRepo { }
export class Order extends OrderRepo { }
export class OrderNumber extends OrderNumberRepo { }
export class Organization extends OrganizationRepo { }
export class OwnershipInfo extends OwnershipInfoRepo { }
export class PaymentMethod extends PaymentMethodRepo { }
export namespace paymentMethod {
    export class MovieTicket extends MovieTicketRepo { }
}
export class Person extends PersonRepo { }
export class ProgramMembership extends ProgramMembershipRepo { }
export class Seller extends SellerRepo { }
export class Task extends TaskRepo { }
export class Transaction extends TransactionRepo { }
export namespace itemAvailability {
}
