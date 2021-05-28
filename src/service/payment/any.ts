/**
 * 汎用決済承認アクションサービス
 */
// import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    seller: chevre.service.Seller;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 承認アクション
 */
export function authorize(params: {
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
    return async (repos: {
        action: ActionRepo;
        seller: chevre.service.Seller;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('Transaction not yours');
        // }

        // 互換性維持対応としてobject.typeOfを使用
        let paymentMethodType = (<any>params).object?.typeOf;
        if (typeof params.object?.paymentMethod === 'string') {
            paymentMethodType = params.object.paymentMethod;
        }

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                paymentMethod: paymentMethodType,
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
            },
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        try {
            // 販売者情報取得
            const seller = await repos.seller.findById({ id: String(transaction.seller.id) });

            // 外部決済連携はしないので、販売者の対応決済方法かどうかのみ確認する
            const paymentAccepted = seller.paymentAccepted?.some((a) => a.paymentMethodType === paymentMethodType);
            if (paymentAccepted !== true) {
                throw new factory.errors.Argument('transaction', `payment not accepted`);
            }
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

        // アクションを完了
        const result: factory.action.authorize.paymentMethod.any.IResult = {
            accountId: '',
            amount: params.object.amount,
            paymentMethod: paymentMethodType,
            paymentStatus: factory.paymentStatusType.PaymentComplete,
            paymentMethodId: '',
            name: (typeof params.object.name === 'string') ? params.object.name : String(paymentMethodType),
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

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        // const actionResult = <factory.action.authorize.paymentMethod.any.IResult>action.result;

        // 承認取消
        try {
            // some op
        } catch (error) {
            // no op
        }
    };
}

/**
 * 返金後のアクション
 */
export function onRefund(
    refundActionAttributes: factory.action.transfer.returnAction.paymentMethod.IAttributes,
    order?: factory.order.IOrder
) {
    return async (repos: {
        task: TaskRepo;
    }) => {
        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        const sendEmailMessageByPotentialActions = potentialActions?.sendEmailMessage;
        if (Array.isArray(sendEmailMessageByPotentialActions)) {
            sendEmailMessageByPotentialActions.forEach((s) => {
                const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                    project: s.project,
                    name: factory.taskName.SendEmailMessage,
                    status: factory.taskStatus.Ready,
                    runsAt: now,
                    remainingNumberOfTries: 3,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        actionAttributes: s
                    }
                };
                taskAttributes.push(sendEmailMessageTask);
            });
        }

        const informOrderByPotentialActions = potentialActions?.informOrder;
        if (Array.isArray(informOrderByPotentialActions)) {
            if (order !== undefined) {
                taskAttributes.push(...informOrderByPotentialActions.map(
                    (a): factory.task.IAttributes<factory.taskName.TriggerWebhook> => {
                        return {
                            project: a.project,
                            name: factory.taskName.TriggerWebhook,
                            status: factory.taskStatus.Ready,
                            runsAt: now,
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: {
                                ...a,
                                object: order
                            }
                        };
                    })
                );
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
