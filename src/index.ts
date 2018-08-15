// tslint:disable:max-classes-per-file completed-docs
/**
 * domain index
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as factory from '@cinerino/factory';
import * as mocoinapi from '@mocoin/api-nodejs-client';
import * as GMO from '@motionpicture/gmo-service';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as AWS from 'aws-sdk';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import * as AccountService from './service/account';
import * as DeliveryService from './service/delivery';
import * as EventService from './service/event';
import * as MasterSyncService from './service/masterSync';
import * as NotificationService from './service/notification';
import * as OrderService from './service/order';
import * as PaymentService from './service/payment';
import * as PersonCreditCardService from './service/person/creditCard';
import * as ProgramMembershipService from './service/programMembership';
import * as ReportService from './service/report';
import * as StockService from './service/stock';
import * as TaskService from './service/task';
import * as PlaceOrderTransactionService from './service/transaction/placeOrder';
import * as PlaceOrderInProgressTransactionService from './service/transaction/placeOrderInProgress';
import * as ReturnOrderTransactionService from './service/transaction/returnOrder';
import * as UtilService from './service/util';

import * as repository from './repository';

/**
 * MongoDBクライアント`mongoose`
 * @example
 * var promise = domain.mongoose.connect('mongodb://localhost/myapp', {
 *     useMongoClient: true
 * });
 */
export import mongoose = mongoose;

/**
 * Redis Cacheクライアント
 * @example
 * const client = domain.redis.createClient({
 *      host: process.env.REDIS_HOST,
 *      port: process.env.REDIS_PORT,
 *      password: process.env.REDIS_KEY,
 *      tls: { servername: process.env.TEST_REDIS_HOST }
 * });
 */
export import redis = redis;

/**
 * GMOのAPIクライアント
 * @example
 * domain.GMO.services.card.searchMember({
 *     siteId: '',
 *     sitePass: '',
 *     memberId: ''
 * }).then((result) => {
 *     console.log(result);
 * });
 */
export import GMO = GMO;

/**
 * Pecorino APIクライアント
 * Pecorinoサービスとの連携は全てこのクライアントを通じて行います。
 */
export import pecorinoapi = pecorinoapi;
export import mocoin = mocoinapi;
export import chevre = chevre;

/**
 * AWS SDK
 */
export import AWS = AWS;

export import factory = factory;
export import repository = repository;
export namespace service {
    export import account = AccountService;
    export import delivery = DeliveryService;
    export import event = EventService;
    export import masterSync = MasterSyncService;
    export import notification = NotificationService;
    export import order = OrderService;
    export namespace person {
        export import creditCard = PersonCreditCardService;
    }
    export import programMembership = ProgramMembershipService;
    export import report = ReportService;
    export import payment = PaymentService;
    export import stock = StockService;
    export import task = TaskService;
    export namespace transaction {
        export import placeOrder = PlaceOrderTransactionService;
        export import placeOrderInProgress = PlaceOrderInProgressTransactionService;
        export import returnOrder = ReturnOrderTransactionService;
    }
    export import util = UtilService;
}
