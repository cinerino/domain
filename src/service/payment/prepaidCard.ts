/**
 * プリペイドカード決済サービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handlePecorinoError } from '../../errorHandler';

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
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
    object: factory.action.authorize.paymentMethod.prepaidCard.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.prepaidCard.IAccount;
        currency?: string;
    };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.prepaidCard.IAction> {
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
        const actionAttributes: factory.action.authorize.paymentMethod.prepaidCard.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                ...(params.object.fromLocation !== undefined)
                    ? { accountId: params.object.fromLocation.accountNumber }
                    : {}
            },
            agent: transaction.agent,
            recipient: recipient,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // 口座取引開始
        let pendingTransaction: factory.action.authorize.paymentMethod.prepaidCard.IPendingTransaction;

        try {
            pendingTransaction = await processAccountTransaction({
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

        const actionResult: factory.action.authorize.paymentMethod.prepaidCard.IResult = {
            accountId: (params.object.fromLocation !== undefined)
                ? params.object.fromLocation.accountNumber
                : '',
            amount: params.object.amount,
            paymentMethod: factory.paymentMethodType.PrepaidCard,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: pendingTransaction.id,
            name: (typeof params.object.name === 'string')
                ? params.object.name
                : (params.object.fromLocation !== undefined)
                    ? String(params.object.fromLocation.accountType)
                    : '',
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            pendingTransaction: pendingTransaction,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            ...(params.object.fromLocation !== undefined) ? { fromAccount: params.object.fromLocation } : {},
            ...(params.object.toLocation !== undefined) ? { toAccount: params.object.toLocation } : {}
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processAccountTransaction(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.paymentMethod.prepaidCard.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.prepaidCard.IAccount;
        currency?: string;
    };
    recipient: factory.transaction.moneyTransfer.IRecipient | factory.transaction.placeOrder.ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
}): Promise<factory.action.authorize.paymentMethod.prepaidCard.IPendingTransaction> {
    let pendingTransaction: factory.action.authorize.paymentMethod.prepaidCard.IPendingTransaction;

    const transaction = params.transaction;

    if (typeof params.project.settings?.pecorino?.endpoint !== 'string') {
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

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore else *//* istanbul ignore next */
    if (params.object.fromLocation !== undefined && params.object.toLocation === undefined) {
        // 転送先口座が指定されていない場合は、出金取引
        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
            endpoint: params.project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await withdrawService.start<string>({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: factory.pecorino.transactionType.Withdraw,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                fromLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.fromLocation.accountType,
                    accountNumber: params.object.fromLocation.accountNumber
                }
            }
        });
    } else if (params.object.fromLocation !== undefined && params.object.toLocation !== undefined) {
        const transferService = new pecorinoapi.service.transaction.Transfer({
            endpoint: params.project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await transferService.start<string>({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: factory.pecorino.transactionType.Transfer,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                fromLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.fromLocation.accountType,
                    accountNumber: params.object.fromLocation.accountNumber
                },
                toLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.toLocation.accountType,
                    accountNumber: params.object.toLocation.accountNumber
                }
            }
        });
    } else if (params.object.fromLocation === undefined && params.object.toLocation !== undefined) {
        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: params.project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await depositService.start<string>({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: factory.pecorino.transactionType.Deposit,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                toLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.toLocation.accountType,
                    accountNumber: params.object.toLocation.accountNumber
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
    params: factory.task.IData<factory.taskName.CancelAccount>
) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.pecorino?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const pecorinoSettings = project.settings.pecorino;

        let transaction: factory.transaction.ITransaction<factory.transactionType> | undefined;
        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
        }

        let authorizeActions: factory.action.authorize.paymentMethod.prepaidCard.IAction[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.paymentMethod.prepaidCard.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (transaction !== undefined) {
                if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                    throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
                }
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.paymentMethod.prepaidCard.IAction[]>
                await repos.action.searchByPurpose({
                    typeOf: factory.actionType.AuthorizeAction,
                    purpose: {
                        typeOf: params.purpose.typeOf,
                        id: params.purpose.id
                    }
                })
                    .then((actions) => actions
                        .filter((a) => a.object.typeOf === factory.paymentMethodType.PrepaidCard)
                    );
        }

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                const pendingTransaction = action.result.pendingTransaction;

                // アクションステータスに関係なく取消処理実行
                switch (action.result.pendingTransaction.typeOf) {
                    case pecorinoapi.factory.transactionType.Deposit:
                        const depositService = new pecorinoapi.service.transaction.Deposit({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await depositService.cancel({ id: pendingTransaction.id });

                        break;

                    case pecorinoapi.factory.transactionType.Withdraw:
                        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await withdrawService.cancel({ id: pendingTransaction.id });

                        break;

                    case pecorinoapi.factory.transactionType.Transfer:
                        const transferService = new pecorinoapi.service.transaction.Transfer({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await transferService.cancel({ id: pendingTransaction.id });

                        break;

                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    default:
                        throw new factory.errors.NotImplemented(
                            `transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
                        );
                }
            }
        }));
    };
}

/**
 * プリペイドカード決済実行
 */
export function payPrepaidCard(params: factory.task.IData<factory.taskName.PayPrepaidCard>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            const pecorinoSettings = project.settings.pecorino;
            if (pecorinoSettings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            await Promise.all(params.object.map(async (paymentMethod) => {
                const pendingTransaction = paymentMethod.pendingTransaction;

                switch (pendingTransaction.typeOf) {
                    case pecorinoapi.factory.transactionType.Withdraw:
                        // 支払取引の場合、確定
                        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await withdrawService.confirm(pendingTransaction);

                        break;

                    case pecorinoapi.factory.transactionType.Transfer:
                        // 転送取引の場合確定
                        const transferService = new pecorinoapi.service.transaction.Transfer({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await transferService.confirm(pendingTransaction);

                        break;

                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    default:
                        throw new factory.errors.NotImplemented(
                            `Transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
                        );
                }

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
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.PrepaidCard> = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * プリペイド返金処理を実行する
 */
export function refundPrepaidCard(params: factory.task.IData<factory.taskName.RefundPrepaidCard>) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            const pecorinoSettings = project.settings.pecorino;
            if (pecorinoSettings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            // 返金アクション属性から、Pecorino取引属性を取り出す
            const payActionAttributes = params.object;

            await Promise.all(payActionAttributes.object.map(async (paymentMethod) => {
                const pendingTransaction = paymentMethod.pendingTransaction;
                const description = `Refund [${pendingTransaction.object.description}]`;

                switch (pendingTransaction.typeOf) {
                    case factory.pecorino.transactionType.Deposit:
                        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        const withdrawTransaction = await withdrawService.start({
                            project: { typeOf: project.typeOf, id: project.id },
                            typeOf: factory.pecorino.transactionType.Withdraw,
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

                        await withdrawService.confirm(withdrawTransaction);

                        break;

                    case factory.pecorino.transactionType.Transfer:
                        const transferService = new pecorinoapi.service.transaction.Transfer({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        const transferTransaction = await transferService.start({
                            project: { typeOf: project.typeOf, id: project.id },
                            typeOf: factory.pecorino.transactionType.Transfer,
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

                        await transferService.confirm(transferTransaction);

                        break;

                    case factory.pecorino.transactionType.Withdraw:
                        const depositService = new pecorinoapi.service.transaction.Deposit({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        const depositTransaction = await depositService.start({
                            project: { typeOf: project.typeOf, id: project.id },
                            typeOf: factory.pecorino.transactionType.Deposit,
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

                        await depositService.confirm(depositTransaction);

                        break;

                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    default:
                        throw new factory.errors.NotImplemented(
                            `transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
                        );
                }
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

/**
 * 返金後のアクション
 * @param refundActionAttributes 返金アクション属性
 */
function onRefund(refundActionAttributes: factory.action.trade.refund.IAttributes<factory.paymentMethodType>) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.sendEmailMessage)) {
                potentialActions.sendEmailMessage.forEach((s) => {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: s.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
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
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
