/**
 * 決済カード決済サービス
 */
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as factory from '../../factory';

import * as chevre from '../../chevre';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleChevreError } from '../../errorHandler';

import { findPayActionByOrderNumber, onRefund } from './any';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 口座残高差し押さえ
 * 口座取引は、出金取引あるいは転送取引のどちらかを選択できます
 */
export function authorize(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.paymentCard.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.paymentCard.IPaymentCard;
        currency?: string;
    };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.paymentCard.IAction> {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        let recipient = transaction.recipient;
        if (transaction.typeOf === factory.transactionType.PlaceOrder) {
            recipient = transaction.seller;
        } else if (transaction.typeOf === factory.transactionType.MoneyTransfer) {
            recipient = transaction.recipient;
            // no op
        } else {
            // 現時点で、他取引タイプは未想定
            throw new factory.errors.Argument('Transaction', `${transaction.typeOf} not implemented`);
        }

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.paymentCard.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                ...(params.object.fromLocation !== undefined)
                    ? { accountId: params.object.fromLocation.identifier }
                    : {},
                typeOf: factory.paymentMethodType.PaymentCard
            },
            agent: transaction.agent,
            recipient: recipient,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // 口座取引開始
        let pendingTransaction: factory.action.authorize.paymentMethod.paymentCard.IPendingTransaction;

        try {
            pendingTransaction = await processMoneyTransferTransaction({
                project: project,
                object: params.object,
                recipient: recipient,
                transaction: transaction
            });
        } catch (error) {
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, name: error.name, message: error.message };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            // PecorinoAPIのエラーをハンドリング
            error = handleChevreError(error);
            throw error;
        }

        const actionResult: factory.action.authorize.paymentMethod.paymentCard.IResult = {
            accountId: (params.object.fromLocation !== undefined)
                ? params.object.fromLocation.identifier
                : '',
            amount: params.object.amount,
            paymentMethod: params.object.fromLocation?.typeOf,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: pendingTransaction.id,
            name: (typeof params.object.name === 'string')
                ? params.object.name
                : (params.object.fromLocation !== undefined)
                    ? String(params.object.fromLocation.typeOf)
                    : '',
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            pendingTransaction: pendingTransaction,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            ...(params.object.fromLocation !== undefined) ? { fromLocation: params.object.fromLocation } : {},
            ...(params.object.toLocation !== undefined) ? { toLocation: params.object.toLocation } : {}
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processMoneyTransferTransaction(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.paymentMethod.paymentCard.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.paymentCard.IPaymentCard;
        currency?: string;
    };
    recipient: factory.transaction.moneyTransfer.IRecipient | factory.transaction.placeOrder.ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
}): Promise<factory.action.authorize.paymentMethod.paymentCard.IPendingTransaction> {
    let pendingTransaction: factory.action.authorize.paymentMethod.paymentCard.IPendingTransaction;

    const transaction = params.transaction;

    if (typeof params.project.settings?.chevre?.endpoint !== 'string') {
        throw new factory.errors.ServiceUnavailable('Project settings not found');
    }

    const agent = {
        typeOf: transaction.agent.typeOf,
        id: transaction.agent.id,
        name: (typeof transaction.agent.name === 'string') ? transaction.agent.name : `${transaction.typeOf} Transaction ${transaction.id}`,
        ...(typeof transaction.agent.url === 'string') ? { url: transaction.agent.url } : undefined
    };

    const recipient = {
        typeOf: params.recipient.typeOf,
        id: params.recipient.id,
        name: (typeof (<any>params.recipient).name === 'string')
            ? (<any>params.recipient).name
            : ((<any>params.recipient).name !== undefined
                && (<any>params.recipient).name !== null
                && typeof (<any>params.recipient).name.ja === 'string')
                ? (<any>params.recipient).name.ja
                : `${transaction.typeOf} Transaction ${transaction.id}`,
        ...(typeof params.recipient.url === 'string') ? { url: params.recipient.url } : undefined
    };

    // const description = (typeof params.object.notes === 'string') ? params.object.notes : `for transaction ${transaction.id}`;
    const description = `Transaction ${transaction.id}`;

    // 最大1ヵ月のオーソリ
    const expires = moment()
        .add(1, 'month')
        .toDate();

    const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
        endpoint: params.project.settings?.chevre?.endpoint,
        auth: chevreAuthClient
    });

    if (params.object.fromLocation !== undefined && params.object.toLocation === undefined) {
        // 転送先口座が指定されていない場合は、出金取引
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: <any>recipient,
            object: {
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: params.object.amount,
                    currency: chevre.factory.priceCurrency.JPY
                },
                description: description,
                fromLocation: {
                    typeOf: params.object.fromLocation.typeOf,
                    identifier: params.object.fromLocation.identifier
                },
                toLocation: <any>{
                    name: recipient.name
                }
            }
        });
    } else if (params.object.fromLocation !== undefined && params.object.toLocation !== undefined) {
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: <any>recipient,
            object: {
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: params.object.amount,
                    currency: chevre.factory.priceCurrency.JPY
                },
                description: description,
                fromLocation: {
                    typeOf: params.object.fromLocation.typeOf,
                    identifier: params.object.fromLocation.identifier
                },
                toLocation: {
                    typeOf: params.object.toLocation.typeOf,
                    identifier: params.object.toLocation.identifier
                }
            }
        });
    } else if (params.object.fromLocation === undefined && params.object.toLocation !== undefined) {
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: <any>recipient,
            object: {
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: params.object.amount,
                    currency: chevre.factory.priceCurrency.JPY
                },
                description: description,
                fromLocation: <any>{
                    name: agent.name
                },
                toLocation: {
                    typeOf: params.object.toLocation.typeOf,
                    identifier: params.object.toLocation.identifier
                }
            }
        });
    } else {
        throw new factory.errors.Argument('Object', 'At least one of accounts from and to must be specified');
    }

    return pendingTransaction;
}

/**
 * プリペイドカード決済承認取消
 */
export function voidTransaction(
    params: factory.task.IData<factory.taskName.CancelPaymentCard>
) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const chevreEndpoint = project.settings?.chevre?.endpoint;
        if (typeof chevreEndpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        let transaction: factory.transaction.ITransaction<factory.transactionType> | undefined;
        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
        }

        let authorizeActions: factory.action.authorize.paymentMethod.paymentCard.IAction[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.paymentMethod.paymentCard.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (transaction !== undefined) {
                if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                    throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
                }
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.paymentMethod.paymentCard.IAction[]>
                await repos.action.searchByPurpose({
                    typeOf: factory.actionType.AuthorizeAction,
                    purpose: {
                        typeOf: params.purpose.typeOf,
                        id: params.purpose.id
                    }
                })
                    .then((actions) => actions
                        // tslint:disable-next-line:no-suspicious-comment
                        // TODO Chevre決済カードサービスに対して動的にコントロール
                        .filter((a) => a.object.typeOf === factory.paymentMethodType.PaymentCard)
                    );
        }

        const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
            endpoint: chevreEndpoint,
            auth: chevreAuthClient
        });

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                const pendingTransaction = action.result.pendingTransaction;
                await moneyTransferService.cancel({ id: pendingTransaction.id });
            }
        }));
    };
}

/**
 * プリペイドカード決済実行
 */
export function payPaymentCard(params: factory.task.IData<factory.taskName.PayPaymentCard>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            const chevreEndpoint = project.settings?.chevre?.endpoint;
            if (typeof chevreEndpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: chevreEndpoint,
                auth: chevreAuthClient
            });

            await Promise.all(params.object.map(async (paymentMethod) => {
                const pendingTransaction = paymentMethod.pendingTransaction;
                await moneyTransferService.confirm(pendingTransaction);

                await repos.invoice.changePaymentStatus({
                    referencesOrder: { orderNumber: params.purpose.orderNumber },
                    paymentMethod: paymentMethod.paymentMethod.typeOf,
                    paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                    paymentStatus: factory.paymentStatusType.PaymentComplete
                });
            }));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.trade.pay.IResult<any> = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * プリペイド返金処理を実行する
 */
export function refundPaymentCard(params: factory.task.IData<factory.taskName.RefundPaymentCard>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        // 本アクションに対応するPayActionを取り出す
        const payAction = await findPayActionByOrderNumber<typeof params.object.typeOf>({
            object: { typeOf: params.object.typeOf, paymentMethodId: params.object.paymentMethodId },
            purpose: { orderNumber: params.purpose.orderNumber }
        })(repos);

        if (payAction === undefined) {
            throw new factory.errors.NotFound('PayAction');
        }

        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            const chevreEndpoint = project.settings?.chevre?.endpoint;
            if (typeof chevreEndpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            // 返金アクション属性から、Pecorino取引属性を取り出す
            // const payActionAttributes = params.object;

            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: chevreEndpoint,
                auth: chevreAuthClient
            });

            await Promise.all(payAction.object.map(async (paymentMethod) => {
                const pendingTransaction = paymentMethod.pendingTransaction;
                const description = `Refund [${pendingTransaction.object.description}]`;

                const moneyTransferTransaction = await moneyTransferService.start({
                    typeOf: chevre.factory.transactionType.MoneyTransfer,
                    project: { typeOf: project.typeOf, id: project.id },
                    agent: pendingTransaction.recipient,
                    expires: moment()
                        // tslint:disable-next-line:no-magic-numbers
                        .add(5, 'minutes')
                        .toDate(),
                    recipient: pendingTransaction.agent,
                    object: {
                        amount: pendingTransaction.object.amount,
                        description: description,
                        fromLocation: pendingTransaction.object.toLocation,
                        toLocation: pendingTransaction.object.fromLocation
                    }
                });

                await moneyTransferService.confirm({ id: moneyTransferTransaction.id });
            }));
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
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onRefund(params)({ task: repos.task });
    };
}
