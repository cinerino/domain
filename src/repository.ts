// tslint:disable:max-classes-per-file completed-docs
/**
 * repository
 */
import { MongoRepository as ActionRepo } from './repo/action';
import { RedisRepository as RegisterServiceActionInProgress } from './repo/action/registerServiceInProgress';
import { RedisRepository as ConfirmationNumberRepo } from './repo/confirmationNumber';
import { MongoRepository as MemberRepo } from './repo/member';
import { RedisRepository as OrderNumberRepo } from './repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from './repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from './repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from './repo/person';
import { MongoRepository as ProjectRepo } from './repo/project';
import { MongoRepository as RoleRepo } from './repo/role';
import { MongoRepository as TaskRepo } from './repo/task';
import { MongoRepository as TelemetryRepo } from './repo/telemetry';
import { MongoRepository as TransactionRepo } from './repo/transaction';

/**
 * アクションリポジトリ
 */
export class Action extends ActionRepo { }

export namespace action {
    export class RegisterServiceInProgress extends RegisterServiceActionInProgress { }
}

/**
 * 確認番号リポジトリ
 */
export class ConfirmationNumber extends ConfirmationNumberRepo { }

/**
 * プロジェクトメンバーリポジトリ
 */
export class Member extends MemberRepo { }

/**
 * 注文番号リポジトリ
 */
export class OrderNumber extends OrderNumberRepo { }

/**
 * 所有権リポジトリ
 */
export class OwnershipInfo extends OwnershipInfoRepo { }

export namespace paymentMethod {
    /**
     * クレジットカードリポジトリ
     */
    export class CreditCard extends CreditCardRepo { }
}

/**
 * 顧客リポジトリ
 */
export class Person extends PersonRepo { }

/**
 * プロジェクトリポジトリ
 */
export class Project extends ProjectRepo { }

export namespace rateLimit {
}

/**
 * ロールリポジトリ
 */
export class Role extends RoleRepo { }

/**
 * タスクリポジトリ
 */
export class Task extends TaskRepo { }

/**
 * 測定リポジトリ
 */
export class Telemetry extends TelemetryRepo { }

/**
 * 取引リポジトリ
 */
export class Transaction extends TransactionRepo { }
