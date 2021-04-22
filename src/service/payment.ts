/**
 * 決済サービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as AnyPaymentService from './payment/any';
import * as ChevrePaymentService from './payment/chevre';

import * as chevre from '../chevre';
import * as factory from '../factory';

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
export function pay(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
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
export function voidPayment(params: factory.task.IData<factory.taskName.VoidPayment>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
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
export function refund(params: factory.task.IData<factory.taskName.Refund>) {
    return async (repos: {
        action: ActionRepo;
        order: chevre.service.Order;
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        await ChevrePaymentService.refund(params)(repos);
    };
}
