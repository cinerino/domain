/**
 * Chevre決済サービス
 */
import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { findPayActionByOrderNumber, onRefund } from './any';

import { handleChevreError } from '../../errorHandler';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function authorize(params: {
    project: { id: string };
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {

        const transaction = await repos.transaction.findInProgressById({ typeOf: params.purpose.typeOf, id: params.purpose.id });

        // 取引番号生成
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const { transactionNumber } = await transactionNumberService.publish({
            project: { id: params.project.id }
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                // paymentMethod: params.object?.paymentMethod,
                paymentMethodId: transactionNumber,
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
            },
            agent: transaction.agent,
            instrument: {
                typeOf: 'WebAPI',
                identifier: factory.action.authorize.paymentMethod.any.ServiceIdentifier.Chevre
            },
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        try {
            // 決済取引開始
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw handleChevreError(error);
        }

        // アクションを完了
        const result: factory.action.authorize.paymentMethod.any.IResult = {
            accountId: '',
            amount: params.object.amount,
            paymentMethod: params.object.paymentMethod,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: transactionNumber,
            name: (typeof params.object.name === 'string') ? params.object.name : params.object.paymentMethod,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function voidTransaction(params: {
    project: { id: string };
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = <factory.action.authorize.paymentMethod.any.IAction>
            await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

        try {
            // no op
        } catch (error) {
            // no op
        }
    };
}

export function pay(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
    }): Promise<factory.action.trade.pay.IAction> => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            await Promise.all(params.object.map(
                async (paymentMethod) => {
                    const paymentMethodId = paymentMethod.paymentMethod.paymentMethodId;
                    // tslint:disable-next-line:no-console
                    console.log('paymentMethodId:', paymentMethodId);
                }
            ));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.trade.pay.IResult = {};

        return <Promise<factory.action.trade.pay.IAction>>
            repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

export function voidPayment(params: factory.task.IData<factory.taskName.VoidPayment>) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 承認アクションを取得
        let authorizeActions = <factory.action.authorize.paymentMethod.any.IAction[]>await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: factory.transactionType.PlaceOrder,
                id: transaction.id
            }
        });
        authorizeActions = authorizeActions.filter(
            (a) => a.instrument?.identifier === factory.action.authorize.paymentMethod.any.ServiceIdentifier.Chevre
        );

        for (const action of authorizeActions) {
            // 直列にゆっくり処理する場合↓
            // tslint:disable-next-line:no-magic-numbers
            // await new Promise((resolve) => setTimeout(() => { resolve(); }, 1000));

            // const paymentMethodId = action.object.paymentMethodId;

            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
        }
    };
}

export function refund(params: factory.task.IData<factory.taskName.Refund>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        order: OrderRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        // 本アクションに対応するPayActionを取り出す
        const payAction = await findPayActionByOrderNumber({
            object: { paymentMethod: params.object.typeOf, paymentMethodId: params.object.paymentMethodId },
            purpose: { orderNumber: params.purpose.orderNumber }
        })(repos);

        if (payAction === undefined) {
            throw new factory.errors.NotFound('PayAction');
        }

        const refundActionAttributes = params;

        const returnOrderTransactions = await repos.transaction.search<factory.transactionType.ReturnOrder>({
            limit: 1,
            typeOf: factory.transactionType.ReturnOrder,
            object: { order: { orderNumbers: [refundActionAttributes.purpose.orderNumber] } }
        });
        const returnOrderTransaction = returnOrderTransactions.shift();
        if (returnOrderTransaction === undefined) {
            throw new factory.errors.NotFound('ReturnOrderTransaction');
        }

        const order = await repos.order.findByOrderNumber({
            orderNumber: refundActionAttributes.purpose.orderNumber
        });

        const action = await repos.action.start(refundActionAttributes);

        try {
            // no op
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw error;
        }

        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onRefund(refundActionAttributes, order)({ project: repos.project, task: repos.task });
    };
}
