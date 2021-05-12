// tslint:disable:max-classes-per-file completed-docs
/**
 * service module
 */
import { service } from '@chevre/domain';

import * as AccountService from './service/account';
import * as CodeService from './service/code';
import * as CustomerService from './service/customer';
import * as DeliveryService from './service/delivery';
import * as OfferService from './service/offer';
import * as OrderService from './service/order';
import * as PaymentService from './service/payment';
import * as ProductService from './service/product';
import * as ReservationService from './service/reservation';
import * as TaskService from './service/task';
import * as TransactionService from './service/transaction';

export import account = AccountService;
export import code = CodeService;
export import customer = CustomerService;
export import delivery = DeliveryService;
export import iam = service.iam;
export import notification = service.notification;
export import offer = OfferService;
export import order = OrderService;
export import product = ProductService;
export import report = service.report;
export import reservation = ReservationService;
export import payment = PaymentService;
export import project = service.project;
export import task = TaskService;
export import transaction = TransactionService;
export import util = service.util;
