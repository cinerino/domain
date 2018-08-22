// tslint:disable:max-classes-per-file completed-docs
/**
 * service module
 */
import * as AccountService from './service/account';
import * as CodeService from './service/code';
import * as DeliveryService from './service/delivery';
import * as EventService from './service/event';
import * as MasterSyncService from './service/masterSync';
import * as NotificationService from './service/notification';
import * as OrderService from './service/order';
import * as PaymentService from './service/payment';
import * as PersonCreditCardService from './service/person/creditCard';
import * as ProgramMembershipService from './service/programMembership';
import * as ReportService from './service/report';
import * as ReservationService from './service/reservation';
import * as StockService from './service/stock';
import * as TaskService from './service/task';
import * as PlaceOrderTransactionService from './service/transaction/placeOrder';
import * as PlaceOrderInProgressTransactionService from './service/transaction/placeOrderInProgress';
import * as ReturnOrderTransactionService from './service/transaction/returnOrder';
import * as UtilService from './service/util';

export import account = AccountService;
export import code = CodeService;
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
export import reservation = ReservationService;
export import payment = PaymentService;
export import stock = StockService;
export import task = TaskService;
export namespace transaction {
    export import placeOrder = PlaceOrderTransactionService;
    export import placeOrderInProgress = PlaceOrderInProgressTransactionService;
    export import returnOrder = ReturnOrderTransactionService;
}
export import util = UtilService;
