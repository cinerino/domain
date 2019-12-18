/**
 * 通貨転送取引サービス
 */
import * as pecorino from '@pecorino/api-nodejs-client';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as AccountService from '../payment/account';

import { createPotentialActions } from './moneyTransfer/potentialActions';

export type IStartOperation<T> = (repos: {
    accountService: pecorino.service.Account;
    action: ActionRepo;
    project: ProjectRepo;
    seller: SellerRepo;
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
 * Pecorinoサービスを利用してWithdrawTransactionあるいはTransferTransactionを開始する
 */
export function start<T extends factory.accountType, T2 extends factory.transaction.moneyTransfer.IToLocationType>(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail<T, T2>
): IStartOperation<factory.transaction.moneyTransfer.ITransaction<T, T2>> {
    return async (repos: {
        accountService: pecorino.service.Account;
        action: ActionRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const seller = await repos.seller.findById({ id: params.seller.id });

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
        let transaction: factory.transaction.moneyTransfer.ITransaction<T, T2>;
        try {
            transaction = <factory.transaction.moneyTransfer.ITransaction<T, T2>>
                await repos.transaction.start<factory.transactionType.MoneyTransfer>(startParams);

            await authorizeAccount({ transaction })(repos);
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

function authorizeAccount<T extends factory.accountType>(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}) {
    return async (repos: {
        // accountService: pecorino.service.Account;
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = params.transaction;
        // const amount = transaction.object.amount;

        if (transaction.object.toLocation.typeOf === factory.pecorino.account.TypeOf.Account) {
            const toLocation
                = <factory.transaction.moneyTransfer.IToLocation<T, factory.pecorino.account.TypeOf.Account>>transaction.object.toLocation;

            // 転送取引
            await AccountService.authorize({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: factory.paymentMethodType.Account,
                    fromAccount: transaction.object.fromLocation,
                    toAccount: toLocation,
                    notes: transaction.object.description
                },
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);
        } else {
            // 出金取引
            await AccountService.authorize({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: factory.paymentMethodType.Account,
                    fromAccount: transaction.object.fromLocation,
                    notes: transaction.object.description
                },
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);
        }
    };
}

function fixFromLocation<T extends factory.accountType, T2 extends factory.transaction.moneyTransfer.IToLocationType>(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail<T, T2>
) {
    return async (repos: {
        accountService: pecorino.service.Account;
    }): Promise<factory.transaction.moneyTransfer.IFromLocation<T>> => {
        let fromLocation: factory.transaction.moneyTransfer.IFromLocation<T> = params.object.fromLocation;

        if (fromLocation.typeOf === factory.pecorino.account.TypeOf.Account) {
            const fromLocationObject = params.object.fromLocation;
            if (fromLocationObject.accountType !== factory.accountType.Coin) {
                throw new factory.errors.Argument('toLocation', `account type must be ${factory.accountType.Coin}`);
            }

            // 口座存在確認
            const searchAccountsResult = await repos.accountService.search<T>({
                limit: 1,
                project: { id: { $eq: params.project.id } },
                accountType: fromLocationObject.accountType,
                accountNumbers: [fromLocationObject.accountNumber],
                statuses: [pecorino.factory.accountStatusType.Opened]
            });

            const account = searchAccountsResult.data.shift();
            if (account === undefined) {
                throw new factory.errors.NotFound('Account', 'To Location Not Found');
            }

            fromLocation = {
                typeOf: account.typeOf,
                accountNumber: account.accountNumber,
                accountType: account.accountType,
                name: account.name
            };
        } else {
            throw new factory.errors.Argument('fromLocation', `location type must be ${factory.pecorino.account.TypeOf.Account}`);
        }

        return fromLocation;
    };
}

function fixToLocation<T extends factory.accountType, T2 extends factory.transaction.moneyTransfer.IToLocationType>(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail<T, T2>
) {
    return async (repos: {
        accountService: pecorino.service.Account;
    }): Promise<factory.transaction.moneyTransfer.IToLocation<T, T2>> => {
        let toLocation: factory.transaction.moneyTransfer.IToLocation<T, T2> = params.object.toLocation;

        if (toLocation.typeOf === factory.pecorino.account.TypeOf.Account) {
            const toLocationObject
                = <factory.transaction.moneyTransfer.IToLocation<T, factory.pecorino.account.TypeOf.Account>>params.object.toLocation;
            if (toLocationObject.accountType !== factory.accountType.Coin) {
                throw new factory.errors.Argument('toLocation', `account type must be ${factory.accountType.Coin}`);
            }

            // 口座存在確認
            const searchAccountsResult = await repos.accountService.search<T>({
                limit: 1,
                project: { id: { $eq: params.project.id } },
                accountType: toLocationObject.accountType,
                accountNumbers: [toLocationObject.accountNumber],
                statuses: [pecorino.factory.accountStatusType.Opened]
            });

            const account = searchAccountsResult.data.shift();
            if (account === undefined) {
                throw new factory.errors.NotFound('Account', 'To Location Not Found');
            }

            toLocation = <any>{
                typeOf: account.typeOf,
                accountNumber: (<any>account).accountNumber,
                accountType: (<any>account).accountType,
                name: account.name
            };
        } else {
            toLocation = <any>{
                typeOf: toLocation.typeOf,
                id: (typeof toLocation.id === 'string') ? toLocation.id : '',
                name: (typeof toLocation.name === 'string') ? toLocation.name : ''
            };
        }

        return toLocation;
    };
}

/**
 * 取引確定
 */
export function confirm<T extends factory.accountType>(params: {
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
        const potentialActions = await createPotentialActions<T>({
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
                const cancelAccountTaskAttributes: factory.task.IAttributes<factory.taskName.CancelAccount> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.CancelAccount,
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

                taskAttributes.push(
                    cancelAccountTaskAttributes
                );

                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
