/**
 * Chevre決済サービス
 */
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
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
    transactionNumber: chevre.service.TransactionNumber;
}) => Promise<T>;

export type IPayOperation<T> = (repos: {
    action: ActionRepo;
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
        transactionNumber: chevre.service.TransactionNumber;
    }) => {
        const transaction = await repos.transaction.findInProgressById({ typeOf: params.purpose.typeOf, id: params.purpose.id });

        const paymentServiceType = params.paymentServiceType;

        // 取引番号生成
        const { transactionNumber } = await repos.transactionNumber.publish({
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

        let payTransaction: chevre.factory.assetTransaction.pay.ITransaction | undefined;

        try {
            // 決済取引開始
            const payService = new chevre.service.assetTransaction.Pay({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient,
                project: { id: params.project.id }
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

export function pay(params: factory.task.IData<factory.taskName.ConfirmPay>): IPayOperation<factory.action.interact.confirm.pay.IAction> {
    return async (repos: {
        action: ActionRepo;
    }) => {
        const payService = new chevre.service.assetTransaction.Pay({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });

        // アクション開始
        const action = await repos.action.start(params);

        try {
            for (const paymentMethod of params.object) {
                await payService.confirm({
                    transactionNumber: paymentMethod.paymentMethod.paymentMethodId,
                    potentialActions: { pay: { purpose: params.purpose } }
                });
                // await repos.invoice.changePaymentStatus({
                //     referencesOrder: { orderNumber: params.purpose.orderNumber },
                //     paymentMethod: paymentMethod.paymentMethod.typeOf,
                //     paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                //     paymentStatus: factory.paymentStatusType.PaymentComplete
                // });
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
        const actionResult: factory.action.interact.confirm.pay.IResult = {};

        return <Promise<factory.action.interact.confirm.pay.IAction>>
            repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

export function voidPayment(params: factory.task.IData<factory.taskName.VoidPayTransaction>) {
    return async (repos: {
        action: ActionRepo;
        assetTransaction: chevre.service.AssetTransaction;
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

        const payService = new chevre.service.assetTransaction.Pay({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });

        const errors: any[] = [];
        for (const action of authorizeActions) {
            // 直列にゆっくり処理する場合↓
            // tslint:disable-next-line:no-magic-numbers
            // await new Promise((resolve) => setTimeout(() => { resolve(); }, 1000));

            // 失敗するケースがあっても、残りが少なくとも処理されるようにエラーハンドリング
            try {
                // 取引が存在すれば中止
                const transactionNumber = action.object.paymentMethodId;
                if (typeof transactionNumber === 'string' && transactionNumber.length > 0) {
                    const { data } = await repos.assetTransaction.search({
                        limit: 1,
                        project: { ids: [action.project.id] },
                        typeOf: chevre.factory.assetTransactionType.Pay,
                        transactionNumber: { $eq: transactionNumber }
                    });
                    if (data.length > 0) {
                        await payService.cancel({ transactionNumber });
                    }
                }

                await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 0) {
            throw errors[0];
        }
    };
}

export function refund(params: factory.task.IData<factory.taskName.ConfirmRefund>) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        product: chevre.service.Product;
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
        transactionNumber: chevre.service.TransactionNumber;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const refundService = new chevre.service.assetTransaction.Refund({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });

        const { transactionNumber } = await repos.transactionNumber.publish({
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
        const paymentServiceType: string | undefined = await getPaymentServiceType({
            project: { id: params.project.id },
            paymentMethodType
        })({ product: repos.product });

        const order = await repos.order.findByOrderNumber({
            orderNumber: refundActionAttributes.purpose.orderNumber
        });

        const action = await repos.action.start(refundActionAttributes);

        let refundTransaction: chevre.factory.assetTransaction.refund.ITransaction | undefined;

        try {
            const returnPolicy = returnOrderTransaction.object.returnPolicy;
            let refundFee: number = 0;
            // 返品ポリシーに返品手数料が定義されていれば、プロジェクト設定から適用する
            if (typeof returnPolicy?.returnFees === 'string') {
                const returnFeeByProject = project.settings?.returnFee;
                if (typeof returnFeeByProject !== 'number') {
                    throw new factory.errors.NotFound('project.settings.returnFee');
                }
                refundFee = returnFeeByProject;
            }

            // no op
            refundTransaction = await refundService.start({
                project: { id: params.project.id, typeOf: chevre.factory.organizationType.Project },
                typeOf: chevre.factory.assetTransactionType.Refund,
                transactionNumber: transactionNumber,
                agent: { typeOf: params.agent.typeOf, name: params.agent.name, id: params.agent.id },
                // tslint:disable-next-line:no-object-literal-type-assertion
                recipient: <factory.person.IPerson | factory.creativeWork.softwareApplication.webApplication.ICreativeWork>
                    { typeOf: params.recipient.typeOf, name: params.recipient.name },
                object: {
                    // paymentServiceType未指定であれば、Chevre側で自動選択される
                    typeOf: (typeof paymentServiceType === 'string') ? paymentServiceType : <any>'',
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

            const refundPurpose: factory.action.transfer.returnAction.order.IAttributes = {
                project: order.project,
                typeOf: <factory.actionType.ReturnAction>factory.actionType.ReturnAction,
                object: {
                    project: order.project,
                    typeOf: order.typeOf,
                    seller: order.seller,
                    customer: order.customer,
                    confirmationNumber: order.confirmationNumber,
                    orderNumber: order.orderNumber,
                    price: order.price,
                    priceCurrency: order.priceCurrency,
                    orderDate: order.orderDate
                },
                agent: refundTransaction.agent,
                recipient: {
                    ...order.seller,
                    project: { typeOf: order.project.typeOf, id: order.project.id }
                }
            };
            await refundService.confirm({
                transactionNumber,
                potentialActions: { refund: { purpose: refundPurpose } }
            });
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw error;
        }

        const result: factory.action.transfer.returnAction.paymentMethod.IResult = {
            refundTransaction
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        // 潜在アクション
        await onRefund(refundActionAttributes, order)({ task: repos.task });
    };
}

function getPaymentServiceType(params: {
    project: { id: string };
    paymentMethodType: string;
}) {
    return async (repos: {
        product: chevre.service.Product;
    }): Promise<chevre.factory.service.paymentService.PaymentServiceType | undefined> => {
        // プロジェクトの対応決済サービスを確認
        const searchPaymentServicesResult = await repos.product.search({
            limit: 1,
            project: { id: { $eq: params.project.id } },
            typeOf: {
                $in: [
                    chevre.factory.service.paymentService.PaymentServiceType.CreditCard,
                    chevre.factory.service.paymentService.PaymentServiceType.MovieTicket,
                    chevre.factory.service.paymentService.PaymentServiceType.PaymentCard
                ]
            },
            serviceOutput: { typeOf: { $eq: params.paymentMethodType } }
        });
        const paymentServiceSetting = <chevre.factory.service.paymentService.IService | undefined>
            searchPaymentServicesResult.data.shift();
        // if (paymentServiceSetting === undefined) {
        //     throw new factory.errors.NotFound('object.paymentMethod', `Payment method type '${params.paymentMethodType}' not found`);
        // }

        return paymentServiceSetting?.typeOf;
    };
}

interface ICreditCardPaymentServiceCredentials {
    endpoint: string;
    siteId: string;
    sitePass: string;
}

export function getCreditCardPaymentServiceChannel(params: {
    project: { id: string };
    paymentMethodType: string;
}) {
    return async (repos: {
        product: chevre.service.Product;
    }): Promise<ICreditCardPaymentServiceCredentials> => {
        const searchPaymentServicesResult = await repos.product.search({
            limit: 1,
            project: { id: { $eq: params.project.id } },
            typeOf: { $eq: chevre.factory.service.paymentService.PaymentServiceType.CreditCard },
            serviceOutput: { typeOf: { $eq: params.paymentMethodType } }
        });
        const paymentServiceSetting = searchPaymentServicesResult.data.shift();
        if (paymentServiceSetting === undefined) {
            throw new factory.errors.NotFound('PaymentService');
        }
        // IDで検索いないとavailableChannelを取得できない
        const paymentService =
            <factory.service.paymentService.IService>await repos.product.findById({ id: String(paymentServiceSetting.id) });

        const availableChannel = paymentService?.availableChannel;
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

    };
}
