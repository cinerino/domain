/**
 * 口座決済サービス
 */
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handlePecorinoError } from '../../errorHandler';

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
// tslint:disable-next-line:max-func-body-length
export function authorize(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject & {
        fromAccount?: factory.action.authorize.paymentMethod.any.IAccount;
        currency?: string;
    };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
    // tslint:disable-next-line:max-func-body-length
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

        // 取引番号生成
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const { transactionNumber } = await transactionNumberService.publish({
            project: { id: project.id }
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                ...(params.object.fromAccount !== undefined)
                    ? {
                        accountId: params.object.fromAccount.accountNumber,
                        paymentMethodId: transactionNumber
                    }
                    : {},
                ...{
                    pendingTransaction: {
                        transactionNumber: transactionNumber
                    }
                },
                paymentMethod: factory.paymentMethodType.Account,
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
            },
            agent: transaction.agent,
            recipient: recipient,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // 口座取引開始
        let pendingTransaction: factory.action.authorize.paymentMethod.any.IPendingTransaction;

        try {
            pendingTransaction = await processAccountTransaction({
                transactionNumber: transactionNumber,
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
            error = handlePecorinoError(error);
            throw error;
        }

        const actionResult: factory.action.authorize.paymentMethod.any.IResult = {
            accountId: (params.object.fromAccount !== undefined)
                ? params.object.fromAccount.accountNumber
                : '',
            amount: params.object.amount,
            paymentMethod: factory.paymentMethodType.Account,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: transactionNumber,
            name: (typeof params.object.name === 'string')
                ? params.object.name
                : (params.object.fromAccount !== undefined)
                    ? String(params.object.fromAccount.accountType)
                    : '',
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            pendingTransaction: pendingTransaction,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: (params.object.currency !== undefined) ? params.object.currency : factory.priceCurrency.JPY,
                value: params.object.amount
            },
            ...(params.object.fromAccount !== undefined) ? { fromAccount: params.object.fromAccount } : {},
            ...(params.object.toAccount !== undefined) ? { toAccount: params.object.toAccount } : {},
            typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processAccountTransaction(params: {
    transactionNumber: string;
    project: factory.project.IProject;
    object: factory.action.authorize.paymentMethod.any.IObject & {
        fromAccount?: factory.action.authorize.paymentMethod.any.IAccount;
        currency?: string;
    };
    recipient: factory.transaction.moneyTransfer.IRecipient | factory.transaction.placeOrder.ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
}): Promise<factory.action.authorize.paymentMethod.any.IPendingTransaction> {
    let pendingTransaction: factory.action.authorize.paymentMethod.any.IPendingTransaction;

    const transaction = params.transaction;

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

    const description = (typeof params.object.notes === 'string') ? params.object.notes : `for transaction ${transaction.id}`;

    // 最大1ヵ月のオーソリ
    const expires = moment()
        .add(1, 'month')
        .toDate();

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore else *//* istanbul ignore next */
    if (params.object.fromAccount !== undefined) {
        // 出金取引開始
        const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        pendingTransaction = await moneyTransferService.start({
            transactionNumber: params.transactionNumber,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            agent: agent,
            expires: expires,
            recipient: <any>recipient,
            object: {
                amount: { value: params.object.amount },
                description: description,
                fromLocation: {
                    typeOf: params.object.fromAccount.accountType,
                    identifier: params.object.fromAccount.accountNumber
                },
                toLocation: recipient,
                pendingTransaction: {
                    typeOf: factory.pecorino.transactionType.Withdraw
                },
                ignorePaymentCard: true
            }
        });
    } else {
        throw new factory.errors.ArgumentNull('object.fromAccount');
    }

    return pendingTransaction;
}

/**
 * 口座承認取消
 */
export function voidTransaction(params: factory.task.IData<factory.taskName.VoidPayment>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        let transaction: factory.transaction.ITransaction<factory.transactionType> | undefined;
        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
        }

        let authorizeActions: factory.action.authorize.paymentMethod.any.IAction[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.paymentMethod.any.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (transaction !== undefined) {
                if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                    throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
                }
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.paymentMethod.any.IAction[]>
                await repos.action.searchByPurpose({
                    typeOf: factory.actionType.AuthorizeAction,
                    purpose: {
                        typeOf: params.purpose.typeOf,
                        id: params.purpose.id
                    }
                })
                    .then((actions) => actions
                        .filter((a) => a.object.paymentMethod === factory.paymentMethodType.Account)
                    );
        }

        const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                const pendingTransactionNumber = action.result.pendingTransaction?.transactionNumber;
                if (typeof pendingTransactionNumber === 'string') {
                    await moneyTransferService.cancel({ transactionNumber: pendingTransactionNumber });
                }
            }
        }));
    };
}

/**
 * 口座支払実行
 */
export function payAccount(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            await Promise.all(params.object.map(
                async (paymentMethod) => {
                    const pendingTransaction = paymentMethod.pendingTransaction;
                    if (pendingTransaction === undefined) {
                        throw new factory.errors.NotFound('object.pendingTransaction');
                    }

                    await moneyTransferService.confirm({ transactionNumber: pendingTransaction.transactionNumber });

                    await repos.invoice.changePaymentStatus({
                        referencesOrder: { orderNumber: params.purpose.orderNumber },
                        paymentMethod: paymentMethod.paymentMethod.typeOf,
                        paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                        paymentStatus: factory.paymentStatusType.PaymentComplete
                    });
                }
            ));
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
        const actionResult: factory.action.trade.pay.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * 口座返金処理を実行する
 */
export function refundAccount(params: factory.task.IData<factory.taskName.Refund>) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        // 本アクションに対応するPayActionを取り出す
        const payAction = await findPayActionByOrderNumber({
            object: { paymentMethod: factory.paymentMethodType.Account, paymentMethodId: params.object.paymentMethodId },
            purpose: { orderNumber: params.purpose.orderNumber }
        })(repos);

        if (payAction === undefined) {
            throw new factory.errors.NotFound('PayAction');
        }

        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });

            // 返金アクション属性から、Pecorino取引属性を取り出す
            // const payActionAttributes = params.object;

            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            await Promise.all(payAction.object.map(async (paymentMethod) => {
                const { transactionNumber } = await transactionNumberService.publish({
                    project: { id: project.id }
                });

                const pendingTransaction = paymentMethod.pendingTransaction;
                if (pendingTransaction === undefined) {
                    throw new factory.errors.NotFound('payAction.object.pendingTransaction');
                }

                const description = `Refund [${pendingTransaction.object.description}]`;

                await moneyTransferService.start({
                    transactionNumber: transactionNumber,
                    project: { typeOf: project.typeOf, id: project.id },
                    typeOf: chevre.factory.transactionType.MoneyTransfer,
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
                        toLocation: pendingTransaction.object.fromLocation,
                        pendingTransaction: {
                            typeOf: factory.pecorino.transactionType.Deposit
                        },
                        ignorePaymentCard: true
                    }
                });

                await moneyTransferService.confirm({ transactionNumber: transactionNumber });
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
        await onRefund(params)({ project: repos.project, task: repos.task });
    };
}
