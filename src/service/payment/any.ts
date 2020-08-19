/**
 * 汎用決済承認アクションサービス
 */
import * as createDebug from 'debug';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

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

/**
 * 承認アクション
 */
export function authorize<T extends factory.paymentMethodType>(params: {
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject<T>;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction<T>> {
    return async (repos: {
        action: ActionRepo;
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
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                paymentMethod: paymentMethodType
            },
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        try {
            // 販売者情報取得
            const sellerService = new chevre.service.Seller({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const seller = await sellerService.findById({ id: String(transaction.seller.id) });

            if (seller.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', `${paymentMethodType} payment not accepted`);
            }
            const paymentAccepted = <factory.seller.IPaymentAccepted<T>>
                seller.paymentAccepted.find((a) => a.paymentMethodType === paymentMethodType);
            if (paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', `${paymentMethodType} payment not accepted`);
            }
        } catch (error) {
            debug(error);
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
        debug('ending authorize action...');
        const result: factory.action.authorize.paymentMethod.any.IResult<T> = {
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
        const actionResult = <factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>action.result;
        debug('actionResult:', actionResult);

        // 承認取消
        try {
            // some op
        } catch (error) {
            // no op
        }
    };
}

export function findPayActionByOrderNumber<T extends factory.paymentMethodType | string>(params: {
    object: {
        paymentMethod: T;
        paymentMethodId: string;
    };
    purpose: { orderNumber: string };
}) {
    return async (repos: {
        action: ActionRepo;
    }): Promise<factory.action.trade.pay.IAction<T> | undefined> => {
        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: params.purpose.orderNumber });
        const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.PayAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

        return (<factory.action.trade.pay.IAction<T>[]>payActions)
            .filter((a) => a.object[0].paymentMethod.typeOf === params.object.paymentMethod)
            .find((a) => {
                return a.object.some((p) => p.paymentMethod.paymentMethodId === params.object.paymentMethodId);
                // a.object[0].paymentMethod.paymentMethodId === params.object.paymentMethodId
            });
    };
}

/**
 * 返金後のアクション
 */
export function onRefund(
    refundActionAttributes: factory.action.trade.refund.IAttributes<factory.paymentMethodType | string>,
    order?: factory.order.IOrder
) {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const project = await repos.project.findById({ id: refundActionAttributes.project.id });

        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // プロジェクトの通知設定を適用
        const informOrderByProject = project.settings?.payment?.onRefunded?.informOrder;
        if (Array.isArray(informOrderByProject)) {
            if (order !== undefined) {
                taskAttributes.push(...informOrderByProject.map(
                    (informOrder): factory.task.IAttributes<factory.taskName.TriggerWebhook> => {
                        return {
                            project: { typeOf: factory.organizationType.Project, id: project.id },
                            name: factory.taskName.TriggerWebhook,
                            status: factory.taskStatus.Ready,
                            runsAt: now,
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: {
                                agent: {
                                    typeOf: order.seller.typeOf,
                                    name: order.seller.name,
                                    id: order.seller.id,
                                    project: { typeOf: factory.organizationType.Project, id: project.id }
                                },
                                object: order,
                                project: { typeOf: factory.organizationType.Project, id: project.id },
                                recipient: {
                                    id: '',
                                    ...informOrder.recipient
                                },
                                typeOf: factory.actionType.InformAction
                            }
                        };
                    })
                );
            }
        }

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
