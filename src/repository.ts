// tslint:disable:max-classes-per-file completed-docs
/**
 * repository
 */
import { RedisRepository as AccountNumberRepo } from './repo/accountNumber';
import { MongoRepository as ActionRepo } from './repo/action';
import { RedisRepository as CodeRepo } from './repo/code';
import { MongoRepository as EventRepo } from './repo/event';
import { MongoRepository as GMONotificationRepo } from './repo/gmoNotification';
import { MongoRepository as OrderRepo } from './repo/order';
import { RedisRepository as OrderNumberRepo } from './repo/orderNumber';
import { MongoRepository as OrganizationRepo } from './repo/organization';
import { MongoRepository as OwnershipInfoRepo } from './repo/ownershipInfo';
import { CognitoRepository as PersonRepo } from './repo/person';
import { MongoRepository as ProgramMembershipRepo } from './repo/programMembership';
import { MongoRepository as SendGridEventRepo } from './repo/sendGridEvent';
import { MongoRepository as TaskRepo } from './repo/task';
import { MongoRepository as TelemetryRepo } from './repo/telemetry';
import { MongoRepository as TransactionRepo } from './repo/transaction';

export class AccountNumber extends AccountNumberRepo { }
export class Action extends ActionRepo { }
export namespace action {
}
export class Code extends CodeRepo { }
export class Event extends EventRepo { }
export class GMONotification extends GMONotificationRepo { }
export class Order extends OrderRepo { }
export class OrderNumber extends OrderNumberRepo { }
export class Organization extends OrganizationRepo { }
export class OwnershipInfo extends OwnershipInfoRepo { }
export class Person extends PersonRepo { }
export class ProgramMembership extends ProgramMembershipRepo { }
export class SendGridEvent extends SendGridEventRepo { }
export class Task extends TaskRepo { }
export class Telemetry extends TelemetryRepo { }
export class Transaction extends TransactionRepo { }
export namespace itemAvailability {
}
