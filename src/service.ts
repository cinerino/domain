// tslint:disable:max-classes-per-file completed-docs
/**
 * service module
 */
import * as AccountService from './service/account';
import * as CodeService from './service/code';
import * as CustomerService from './service/customer';
import * as DeliveryService from './service/delivery';
import * as IAMService from './service/iam';
import * as NotificationService from './service/notification';
import * as OfferService from './service/offer';
import * as OrderService from './service/order';
import * as PaymentService from './service/payment';
import * as ProductService from './service/product';
import * as ProjectService from './service/project';
import * as ReportService from './service/report';
import * as ReservationService from './service/reservation';
import * as TaskService from './service/task';
import * as TransactionService from './service/transaction';
import * as UtilService from './service/util';

export import account = AccountService;
export import code = CodeService;
export import customer = CustomerService;
export import delivery = DeliveryService;
export import iam = IAMService;
export import notification = NotificationService;
export import offer = OfferService;
export import order = OrderService;
export namespace person {
}
export import product = ProductService;
export import report = ReportService;
export import reservation = ReservationService;
export import payment = PaymentService;
export import project = ProjectService;
export import task = TaskService;
export import transaction = TransactionService;
export import util = UtilService;
