/**
 * Chevre決済サービス
 */
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { onRefund } from './any';
import { createAuthorizeResult, creatPayTransactionStartParams } from './chevre/factory';

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
    paymentServiceType: chevre.factory.service.paymentService.PaymentServiceType;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({ typeOf: params.purpose.typeOf, id: params.purpose.id });

        const paymentServiceType = params.paymentServiceType;
        // プロジェクトの対応決済サービスを確認
        // const paymentMethodType = params.object.paymentMethod;
        // const paymentServiceType = await getPaymentServiceType({ project: { id: params.project.id }, paymentMethodType });

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

        let payTransaction: chevre.factory.transaction.pay.ITransaction | undefined;

        try {
            // 決済取引開始
            const payService = new chevre.service.transaction.Pay({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            const startParams = creatPayTransactionStartParams({
                object: params.object,
                paymentServiceType,
                transaction: transaction,
                transactionNumber: transactionNumber
            });

            payTransaction = await payService.start(startParams);
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
        const result = createAuthorizeResult({ paymentServiceType, payTransaction, object: params.object });

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function pay(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
    }): Promise<factory.action.trade.pay.IAction> => {
        const payService = new chevre.service.transaction.Pay({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        // アクション開始
        const action = await repos.action.start(params);

        try {
            for (const paymentMethod of params.object) {
                await payService.confirm({
                    transactionNumber: paymentMethod.paymentMethod.paymentMethodId,
                    potentialActions: {
                        pay: {
                            purpose: params.purpose
                        }
                    }
                });

                await repos.invoice.changePaymentStatus({
                    referencesOrder: { orderNumber: params.purpose.orderNumber },
                    paymentMethod: paymentMethod.paymentMethod.typeOf,
                    paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                    paymentStatus: factory.paymentStatusType.PaymentComplete
                });
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
        let authorizeActions: factory.action.authorize.paymentMethod.any.IAction[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.paymentMethod.any.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: factory.transactionType.PlaceOrder,
                    id: transaction.id
                }
            });
            authorizeActions = authorizeActions.filter(
                (a) => a.object?.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment
                    && a.instrument?.identifier === factory.action.authorize.paymentMethod.any.ServiceIdentifier.Chevre
            );
        }

        const payService = new chevre.service.transaction.Pay({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        for (const action of authorizeActions) {
            // 直列にゆっくり処理する場合↓
            // tslint:disable-next-line:no-magic-numbers
            // await new Promise((resolve) => setTimeout(() => { resolve(); }, 1000));

            await payService.cancel({ transactionNumber: action.object.paymentMethodId });

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
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const refundService = new chevre.service.transaction.Refund({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const { transactionNumber } = await transactionNumberService.publish({
            project: { id: params.project.id }
        });

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

        // プロジェクトの対応決済方法を確認
        const paymentMethodType = params.object.typeOf;

        // プロジェクトの対応決済サービスを確認
        const paymentServiceType = await getPaymentServiceType({ project: { id: params.project.id }, paymentMethodType });

        const order = await repos.order.findByOrderNumber({
            orderNumber: refundActionAttributes.purpose.orderNumber
        });

        const action = await repos.action.start(refundActionAttributes);

        let refundTransaction: chevre.factory.transaction.refund.ITransaction | undefined;

        try {
            const refundFee: number = (typeof returnOrderTransaction.object.cancellationFee === 'number')
                ? returnOrderTransaction.object.cancellationFee
                : 0;

            // no op
            refundTransaction = await refundService.start({
                project: { id: params.project.id, typeOf: chevre.factory.organizationType.Project },
                typeOf: chevre.factory.transactionType.Refund,
                transactionNumber: transactionNumber,
                agent: { typeOf: params.agent.typeOf, name: params.agent.name, id: params.agent.id },
                recipient: { typeOf: params.recipient.typeOf, name: params.recipient.name },
                object: {
                    typeOf: paymentServiceType,
                    paymentMethod: {
                        additionalProperty: params.object.additionalProperty,
                        name: params.object.name,
                        typeOf: params.object.typeOf,
                        paymentMethodId: params.object.paymentMethodId
                    },
                    refundFee: refundFee
                },
                expires: moment()
                    .add(1, 'minutes')
                    .toDate()
            });

            await refundService.confirm({ transactionNumber });
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw error;
        }

        const result: factory.action.trade.refund.IResult = {
            refundTransaction
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        // 潜在アクション
        await onRefund(refundActionAttributes, order)({ project: repos.project, task: repos.task });
    };
}

async function getPaymentServiceType(params: {
    project: { id: string };
    paymentMethodType: string;
}): Promise<chevre.factory.service.paymentService.PaymentServiceType> {
    // プロジェクトの対応決済サービスを確認
    const projectService = new chevre.service.Project({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });
    const chevreProject = await projectService.findById({ id: params.project.id });
    const paymentServiceSetting = chevreProject.settings?.paymentServices?.find((s) => {
        return s.serviceOutput?.typeOf === params.paymentMethodType;
    });
    if (paymentServiceSetting === undefined) {
        throw new factory.errors.NotFound('object.paymentMethod', `Payment method type '${params.paymentMethodType}' not found`);
    }

    return paymentServiceSetting.typeOf;
}

interface ICreditCardPaymentServiceCredentials {
    endpoint: string;
    siteId: string;
    sitePass: string;
}

export async function getCreditCardPaymentServiceChannel(params: {
    project: { id: string };
    paymentMethodType: string;
}): Promise<ICreditCardPaymentServiceCredentials> {
    const projectService = new chevre.service.Project({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });
    const chevreProject = await projectService.findById({ id: params.project.id });
    const paymentServiceSetting = chevreProject.settings?.paymentServices?.find((s) => {
        return s.typeOf === chevre.factory.service.paymentService.PaymentServiceType.CreditCard
            && s.serviceOutput?.typeOf === params.paymentMethodType;
    });

    const availableChannel = paymentServiceSetting?.availableChannel;
    if (typeof availableChannel?.serviceUrl !== 'string') {
        throw new factory.errors.NotFound('paymentService.availableChannel.serviceUrl');
    }
    if (typeof availableChannel?.credentials?.siteId !== 'string') {
        throw new factory.errors.NotFound('paymentService.availableChannel.credentials.siteId');
    }
    if (typeof availableChannel?.credentials?.sitePass !== 'string') {
        throw new factory.errors.NotFound('paymentService.availableChannel.credentials.sitePass');
    }

    return {
        endpoint: availableChannel.serviceUrl,
        siteId: availableChannel.credentials.siteId,
        sitePass: availableChannel.credentials.sitePass
    };
}
