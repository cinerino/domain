// tslint:disable:max-classes-per-file completed-docs
/**
 * service module
 */
import * as AccountService from './service/account';
import * as CodeService from './service/code';
import * as DeliveryService from './service/delivery';
import * as MasterSyncService from './service/masterSync';
import * as NotificationService from './service/notification';
import * as OfferService from './service/offer';
import * as OrderService from './service/order';
import * as PaymentService from './service/payment';
import * as ProgramMembershipService from './service/programMembership';
import * as ReportService from './service/report';
import * as ReservationService from './service/reservation';
import * as StockService from './service/stock';
import * as TaskService from './service/task';
import * as MoneyTransferTransactionService from './service/transaction/moneyTransfer';
import * as PlaceOrderTransactionService from './service/transaction/placeOrder';
import * as PlaceOrderInProgressTransactionService from './service/transaction/placeOrderInProgress';
import * as ReturnOrderTransactionService from './service/transaction/returnOrder';
import * as UtilService from './service/util';

export import account = AccountService;
export import code = CodeService;
export import delivery = DeliveryService;
export import masterSync = MasterSyncService;
export import notification = NotificationService;
export import offer = OfferService;
export import order = OrderService;
export namespace person {
}
export import programMembership = ProgramMembershipService;
export import report = ReportService;
export import reservation = ReservationService;
export import payment = PaymentService;
export import stock = StockService;
export import task = TaskService;
export namespace transaction {
    export import moneyTransfer = MoneyTransferTransactionService;
    export import placeOrder = PlaceOrderTransactionService;
    export import placeOrderInProgress = PlaceOrderInProgressTransactionService;
    export import returnOrder = ReturnOrderTransactionService;
}
export import util = UtilService;
