/**
 * 決済サービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as AnyPaymentService from './payment/any';
import * as ChevrePaymentService from './payment/chevre';

import { factory } from '../factory';

import * as chevreapi from '../chevre';

/**
 * 汎用決済
 */
export import any = AnyPaymentService;

/**
 * Chevre決済
 */
export import chevre = ChevrePaymentService;

/**
 * 決済
 */
export function pay(params: factory.task.IData<factory.taskName.ConfirmPay>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        if (params.instrument?.identifier === factory.action.authorize.paymentMethod.any.ServiceIdentifier.Chevre) {
            await ChevrePaymentService.pay(params)(repos);

            return;
        }

        const paymentMethodType = params.object[0]?.paymentMethod.typeOf;

        switch (paymentMethodType) {
            default:
                throw new factory.errors.NotImplemented(`Payment method '${paymentMethodType}' not implemented`);
        }
    };
}

/**
 * 決済中止
 */
export function voidPayment(params: factory.task.IData<factory.taskName.VoidPayTransaction>) {
    return async (repos: {
        action: ActionRepo;
        assetTransaction: chevreapi.service.AssetTransaction;
        transaction: TransactionRepo;
    }) => {
        // 決済承認アクションを検索
        let authorizeActions = <factory.action.authorize.paymentMethod.any.IAction[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            });
        authorizeActions = authorizeActions.filter(
            (a) => a.object.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment
        );

        // Chevreを使用した承認を取り消し
        const authorizeActionsWithChevre = authorizeActions.filter((a) => {
            return a.instrument?.identifier === factory.action.authorize.paymentMethod.any.ServiceIdentifier.Chevre;
        });
        if (authorizeActionsWithChevre.length > 0) {
            await ChevrePaymentService.voidPayment(params)(repos);
        }
    };
}

/**
 * 返金
 */
export function refund(params: factory.task.IData<factory.taskName.ConfirmRefund>) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        product: chevreapi.service.Product;
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
        transactionNumber: chevreapi.service.TransactionNumber;
    }) => {
        await ChevrePaymentService.refund(params)(repos);
    };
}
