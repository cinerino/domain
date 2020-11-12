/**
 * 通貨転送取引サービス
 */
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { createPotentialActions } from './moneyTransfer/potentialActions';

import { handleChevreError } from '../../errorHandler';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type ITaskAndTransactionOperation<T> = (repos: {
    project: ProjectRepo;
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引開始
 * Chevre通貨転送サービスを利用して転送取引を開始する
 */
export function start(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.moneyTransfer.ITransaction> {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: params.seller.id });

        // 金額をfix
        const amount = params.object.amount;
        if (typeof amount !== 'number') {
            throw new factory.errors.ArgumentNull('amount');
        }

        // fromとtoをfix
        const fromLocation = await fixFromLocation(params)(repos);
        const toLocation = await fixToLocation(params)(repos);

        // 取引開始
        const startParams: factory.transaction.IStartParams<factory.transactionType.MoneyTransfer> = {
            project: params.project,
            typeOf: factory.transactionType.MoneyTransfer,
            agent: params.agent,
            recipient: params.recipient,
            seller: {
                project: seller.project,
                id: seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            object: {
                amount: amount,
                fromLocation: fromLocation,
                toLocation: toLocation,
                authorizeActions: [],
                ...(typeof params.object.description === 'string') ? { description: params.object.description } : {}
            },
            expires: params.expires
        };

        // 取引開始
        let transaction: factory.transaction.moneyTransfer.ITransaction;
        try {
            transaction = await repos.transaction.start<factory.transactionType.MoneyTransfer>(startParams);

            await authorizePaymentCard({ transaction })(repos);
        } catch (error) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (error.name === 'MongoError') {
                // no op
            }

            throw error;
        }

        return transaction;
    };
}

function authorizePaymentCard(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = params.transaction;
        // const amount = transaction.object.amount;

        const fromLocation = <factory.action.transfer.moneyTransfer.IPaymentCard>transaction.object.fromLocation;

        if (typeof transaction.object.toLocation.typeOf === 'string') {
            const toLocation = <factory.action.transfer.moneyTransfer.IPaymentCard>transaction.object.toLocation;

            // 転送取引
            await processAuthorizePaymentCard({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment,
                    // typeOf: fromLocation.typeOf,
                    paymentMethod: fromLocation.typeOf,
                    fromLocation: fromLocation,
                    toLocation: toLocation,
                    ...{
                        description: transaction.object.description
                    }
                },
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);
        } else {
            // 出金取引
            await processAuthorizePaymentCard({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment,
                    // typeOf: fromLocation.typeOf,
                    paymentMethod: fromLocation.typeOf,
                    fromLocation: fromLocation,
                    ...{
                        description: transaction.object.description
                    }
                },
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);
        }
    };
}

function fixFromLocation(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail
) {
    return async (__: {
    }): Promise<factory.transaction.moneyTransfer.IFromLocation> => {
        let fromLocation = <factory.action.transfer.moneyTransfer.IPaymentCard>params.object.fromLocation;

        if (typeof fromLocation.typeOf === 'string') {
            const fromLocationObject = fromLocation;

            fromLocation = {
                typeOf: fromLocationObject.typeOf,
                identifier: fromLocationObject.identifier
            };
        } else {
            throw new factory.errors.Argument('fromLocation', 'location type must be specified');
        }

        return fromLocation;
    };
}

function fixToLocation(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail
) {
    return async (__: {
    }): Promise<factory.transaction.moneyTransfer.IToLocation> => {
        let toLocation: factory.transaction.moneyTransfer.IToLocation = params.object.toLocation;

        if (typeof toLocation.typeOf === 'string') {
            toLocation = <any>{
                typeOf: params.object.toLocation.typeOf,
                identifier: (<any>params.object.toLocation).identifier
            };
        } else {
            toLocation = <any>{
                ...toLocation
                // typeOf: toLocation.typeOf,
                // id: (typeof toLocation.id === 'string') ? toLocation.id : '',
                // name: (typeof toLocation.name === 'string') ? toLocation.name : ''
            };
        }

        return toLocation;
    };
}

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 口座残高差し押さえ
 * 口座取引は、出金取引あるいは転送取引のどちらかを選択できます
 */
function processAuthorizePaymentCard(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.any.IPaymentCard;
        currency?: string;
    };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction> {
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
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                ...(params.object.fromLocation !== undefined)
                    ? { accountId: params.object.fromLocation.identifier }
                    : {},
                paymentMethod: <string>params.object?.fromLocation?.typeOf,
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

        const actionResult: factory.action.authorize.paymentMethod.any.IResult = {
            accountId: (params.object.fromLocation !== undefined)
                ? params.object.fromLocation.identifier
                : '',
            amount: params.object.amount,
            paymentMethod: <string>params.object.fromLocation?.typeOf,
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
            ...(params.object.toLocation !== undefined) ? { toLocation: params.object.toLocation } : {},
            typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processMoneyTransferTransaction(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.paymentMethod.any.IObject & {
        fromLocation?: factory.action.authorize.paymentMethod.any.IPaymentCard;
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

    // const description = (typeof params.object.notes === 'string') ? params.object.notes : `for transaction ${transaction.id}`;
    const description = `Transaction ${transaction.id}`;

    // 最大1ヵ月のオーソリ
    const expires = moment()
        .add(1, 'month')
        .toDate();

    const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });

    if (params.object.fromLocation !== undefined && params.object.toLocation === undefined) {
        // 転送先口座が指定されていない場合は、出金取引
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: recipient,
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
                    typeOf: recipient.typeOf,
                    name: recipient.name
                },
                pendingTransaction: {
                    typeOf: factory.pecorino.transactionType.Withdraw,
                    id: '' // 空でok
                }
            }
        });
    } else if (params.object.fromLocation !== undefined && params.object.toLocation !== undefined) {
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: recipient,
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
                },
                pendingTransaction: {
                    typeOf: factory.pecorino.transactionType.Transfer,
                    id: '' // 空でok
                }
            }
        });
    } else if (params.object.fromLocation === undefined && params.object.toLocation !== undefined) {
        pendingTransaction = await moneyTransferService.start({
            typeOf: chevre.factory.transactionType.MoneyTransfer,
            project: { typeOf: params.project.typeOf, id: params.project.id },
            agent: agent,
            expires: expires,
            recipient: recipient,
            object: {
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: params.object.amount,
                    currency: chevre.factory.priceCurrency.JPY
                },
                description: description,
                fromLocation: {
                    typeOf: agent.typeOf,
                    name: agent.name
                },
                toLocation: {
                    typeOf: params.object.toLocation.typeOf,
                    identifier: params.object.toLocation.identifier
                },
                pendingTransaction: {
                    typeOf: factory.pecorino.transactionType.Deposit,
                    id: '' // 空でok
                }
            }
        });
    } else {
        throw new factory.errors.Argument('Object', 'At least one of accounts from and to must be specified');
    }

    return pendingTransaction;
}

/**
 * 取引確定
 */
export function confirm(params: {
    id: string;
}): IConfirmOperation<void> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.MoneyTransfer,
            id: params.id
        });

        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transactionId', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
        }

        // if (transaction.agent.id !== params.agent.id) {
        //     throw new factory.errors.Forbidden('Transaction not yours');
        // }

        // 取引に対する全ての承認アクションをマージ
        transaction.object.authorizeActions = await searchAuthorizeActions({
            transaction: transaction,
            now: now
        })(repos);

        // ポストアクションを作成
        const potentialActions = await createPotentialActions({
            transaction: transaction
        });

        // 取引確定
        await repos.transaction.confirm({
            typeOf: factory.transactionType.MoneyTransfer,
            id: transaction.id,
            authorizeActions: transaction.object.authorizeActions,
            result: {},
            potentialActions: potentialActions
        });
    };
}

function searchAuthorizeActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
    now: Date;
}) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        let authorizeActions = await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        });

        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => {
            return a.endDate !== undefined
                && moment(a.endDate)
                    .toDate() < params.now;
        });

        return authorizeActions;
    };
}

/**
 * 取引のタスク出力
 */
export function exportTasksById(params: {
    id: string;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
}): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.MoneyTransfer,
            id: params.id
        });
        const potentialActions = transaction.potentialActions;

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // タスク実行日時バッファの指定があれば調整
        let taskRunsAt = new Date();
        if (typeof params.runsTasksAfterInSeconds === 'number') {
            taskRunsAt = moment(taskRunsAt)
                .add(params.runsTasksAfterInSeconds, 'seconds')
                .toDate();
        }

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (potentialActions !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (potentialActions.moneyTransfer !== undefined) {
                        taskAttributes.push(...potentialActions.moneyTransfer.map((a) => {
                            return {
                                project: transaction.project,
                                name: <factory.taskName.MoneyTransfer>factory.taskName.MoneyTransfer,
                                status: factory.taskStatus.Ready,
                                runsAt: taskRunsAt,
                                remainingNumberOfTries: 10,
                                numberOfTried: 0,
                                executionResults: [],
                                data: a
                            };
                        }));
                    }
                }

                break;

            case factory.transactionStatusType.Canceled:
            case factory.transactionStatusType.Expired:
                const voidPaymentTaskAttributes: factory.task.IAttributes<factory.taskName.VoidPayment> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.VoidPayment,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };

                taskAttributes.push(voidPaymentTaskAttributes);

                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
