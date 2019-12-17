/**
 * 口座決済サービス
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
export function authorize<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.account.IObject<T> & {
        fromAccount?: factory.action.authorize.paymentMethod.account.IAccount<T>;
        currency?: string;
    };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.account.IAction<T>> {
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
        const actionAttributes: factory.action.authorize.paymentMethod.account.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                ...(params.object.fromAccount !== undefined)
                    ? { accountId: params.object.fromAccount.accountNumber }
                    : {}
            },
            agent: transaction.agent,
            recipient: recipient,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // 口座取引開始
        let pendingTransaction: factory.action.authorize.paymentMethod.account.IPendingTransaction<T>;

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

        const actionResult: factory.action.authorize.paymentMethod.account.IResult<T> = {
            accountId: (params.object.fromAccount !== undefined)
                ? params.object.fromAccount.accountNumber
                : '',
            amount: params.object.amount,
            paymentMethod: factory.paymentMethodType.Account,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: pendingTransaction.id,
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
            ...(params.object.toAccount !== undefined) ? { toAccount: params.object.toAccount } : {}
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processAccountTransaction<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.paymentMethod.account.IObject<T> & {
        fromAccount?: factory.action.authorize.paymentMethod.account.IAccount<T>;
        currency?: string;
    };
    recipient: factory.transaction.moneyTransfer.IRecipient | factory.transaction.placeOrder.ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
}): Promise<factory.action.authorize.paymentMethod.account.IPendingTransaction<T>> {
    let pendingTransaction: factory.action.authorize.paymentMethod.account.IPendingTransaction<T>;

    const project = params.project;
    const transaction = params.transaction;

    if (project.settings === undefined || project.settings.pecorino === undefined) {
        throw new factory.errors.ServiceUnavailable('Project settings not found');
    }

    let recipientName = (params.recipient.typeOf === factory.personType.Person) ? params.recipient.name : params.recipient.name.ja;
    recipientName = (recipientName === undefined) ? params.recipient.id : recipientName;
    const recipient = {
        typeOf: params.recipient.typeOf,
        id: params.recipient.id,
        name: recipientName,
        url: params.recipient.url
    };

    const agent = {
        typeOf: transaction.agent.typeOf,
        id: transaction.agent.id,
        name: `${transaction.typeOf} Transaction ${transaction.id}`,
        url: transaction.agent.url
    };

    const description = (params.object.notes !== undefined) ? params.object.notes : agent.name;

    // 最大1ヵ月のオーソリ
    const expires = moment()
        .add(1, 'month')
        .toDate();

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore else *//* istanbul ignore next */
    if (params.object.fromAccount !== undefined && params.object.toAccount === undefined) {
        // 転送先口座が指定されていない場合は、出金取引
        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await withdrawService.start<T>({
            project: { typeOf: 'Project', id: params.project.id },
            typeOf: factory.pecorino.transactionType.Withdraw,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                fromLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.fromAccount.accountType,
                    accountNumber: params.object.fromAccount.accountNumber
                }
            }
        });
    } else if (params.object.fromAccount !== undefined && params.object.toAccount !== undefined) {
        const transferService = new pecorinoapi.service.transaction.Transfer({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await transferService.start<T>({
            project: { typeOf: 'Project', id: project.id },
            typeOf: factory.pecorino.transactionType.Transfer,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                fromLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.fromAccount.accountType,
                    accountNumber: params.object.fromAccount.accountNumber
                },
                toLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.toAccount.accountType,
                    accountNumber: params.object.toAccount.accountNumber
                }
            }
        });
    } else if (params.object.fromAccount === undefined && params.object.toAccount !== undefined) {
        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        pendingTransaction = await depositService.start<T>({
            project: { typeOf: 'Project', id: project.id },
            typeOf: factory.pecorino.transactionType.Deposit,
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: params.object.amount,
                description: description,
                toLocation: {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: params.object.toAccount.accountType,
                    accountNumber: params.object.toAccount.accountNumber
                }
            }
        });
    } else {
        throw new factory.errors.Argument('Object', 'At least one of accounts from and to must be specified');
    }

    return pendingTransaction;
}

/**
 * 口座承認取消
 */
export function voidTransaction(params: {
    project: factory.project.IProject;
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        // 進行中取引存在確認
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        // まずアクションをキャンセル
        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>action.result;
        const pendingTransaction = actionResult.pendingTransaction;

        // Pecorinoで取消中止実行
        switch (pendingTransaction.typeOf) {
            case pecorinoapi.factory.transactionType.Deposit:
                const depositService = new pecorinoapi.service.transaction.Deposit({
                    endpoint: project.settings.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                await depositService.cancel({ id: pendingTransaction.id });

                break;

            case pecorinoapi.factory.transactionType.Transfer:
                const transferService = new pecorinoapi.service.transaction.Transfer({
                    endpoint: project.settings.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                await transferService.cancel({ id: pendingTransaction.id });

                break;

            case pecorinoapi.factory.transactionType.Withdraw:
                const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                    endpoint: project.settings.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                await withdrawService.cancel({ id: pendingTransaction.id });

                break;

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            default:
                throw new factory.errors.NotImplemented(
                    `Transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
                );
        }
    };
}

/**
 * 口座支払実行
 */
export function payAccount(params: factory.task.IData<factory.taskName.PayAccount>) {
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
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.Account> = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * 口座オーソリ取消
 */
export function cancelAccountAuth(params: factory.task.IData<factory.taskName.CancelAccount>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined
            || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        const pecorinoSettings = project.settings.pecorino;

        // 口座承認アクションを取得
        const authorizeActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            })
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.paymentMethodType.Account)
                );
        await Promise.all(authorizeActions.map(async (action) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                // アクションステータスに関係なく取消処理実行
                switch (action.result.pendingTransaction.typeOf) {
                    case pecorinoapi.factory.transactionType.Withdraw:
                        const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await withdrawService.cancel(action.result.pendingTransaction);

                        break;

                    case pecorinoapi.factory.transactionType.Transfer:
                        const transferService = new pecorinoapi.service.transaction.Transfer({
                            endpoint: pecorinoSettings.endpoint,
                            auth: pecorinoAuthClient
                        });
                        await transferService.cancel(action.result.pendingTransaction);

                        break;

                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    default:
                        throw new factory.errors.NotImplemented(
                            `transaction type '${(<any>action.result.pendingTransaction).typeOf}' not implemented.`
                        );
                }

                await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
            }
        }));
    };
}

/**
 * 口座返金処理を実行する
 */
export function refundAccount(params: factory.task.IData<factory.taskName.RefundAccount>) {
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
                            project: { typeOf: 'Project', id: project.id },
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
                            project: { typeOf: 'Project', id: project.id },
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
                            project: { typeOf: 'Project', id: project.id },
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
