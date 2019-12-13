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
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引開始
 */
// tslint:disable-next-line:max-func-body-length
export function start<T extends factory.accountType>(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail<T>
): IStartOperation<factory.transaction.moneyTransfer.ITransaction<T>> {
    return async (repos: {
        accountService: pecorino.service.Account;
        action: ActionRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const seller = await repos.seller.findById({ id: params.seller.id });

        const amount = params.object.amount;
        if (typeof amount !== 'number') {
            throw new factory.errors.ArgumentNull('amount');
        }
        let toLocation = params.object.toLocation;
        if (toLocation === undefined) {
            throw new factory.errors.ArgumentNull('toLocation');
        }

        if (toLocation.typeOf === factory.pecorino.account.TypeOf.Account) {
            if (toLocation.accountType !== factory.accountType.Coin) {
                throw new factory.errors.Argument('toLocation', `account type must be ${factory.accountType.Coin}`);
            }

            // 口座存在確認
            const searchAccountsResult = await repos.accountService.search<T>({
                limit: 1,
                project: { id: { $eq: params.project.id } },
                accountType: toLocation.accountType,
                accountNumbers: [toLocation.accountNumber],
                statuses: [pecorino.factory.accountStatusType.Opened]
            });
            toLocation = searchAccountsResult.data.shift();
            if (toLocation === undefined) {
                throw new factory.errors.NotFound('Account', 'To Location Not Found');
            }
        } else {
            throw new factory.errors.Argument('toLocation', `location type must be ${factory.pecorino.account.TypeOf.Account}`);
        }

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
                toLocation: {
                    typeOf: toLocation.typeOf,
                    accountType: toLocation.accountType,
                    accountNumber: toLocation.accountNumber,
                    name: toLocation.name
                },
                authorizeActions: [],
                ...(typeof params.object.description === 'string') ? { description: params.object.description } : {}
            },
            expires: params.expires
        };

        // 取引作成
        let transaction: factory.transaction.moneyTransfer.ITransaction<T>;
        try {
            transaction = <factory.transaction.moneyTransfer.ITransaction<T>>
                await repos.transaction.start<factory.transactionType.MoneyTransfer>(startParams);

            // 入金取引承認
            await AccountService.authorize({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: amount,
                    typeOf: factory.paymentMethodType.Account,
                    toAccount: transaction.object.toLocation,
                    notes: transaction.object.description
                },
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);

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

/**
 * 取引確定
 */
export function confirm<T extends factory.accountType>(params: {
    id: string;
}): IConfirmOperation<void> {
    // tslint:disable-next-line:max-func-body-length
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
        let authorizeActions = await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: transaction.typeOf,
                id: params.id
            }
        });
        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => {
            return a.endDate !== undefined
                && moment(a.endDate)
                    .toDate() < now;
        });
        transaction.object.authorizeActions = authorizeActions;

        // まずは1承認アクションのみ対応(順次拡張)
        // const completedAuthorizeActions = transaction.object.authorizeActions
        //     .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);
        // if (completedAuthorizeActions.length !== 1) {
        //     throw new factory.errors.Argument('Transaction', 'Number of authorize actions must be 1');
        // }

        // ポストアクションを作成
        const potentialActions = await createPotentialActions<T>({
            transaction: transaction
        });

        // 取引確定
        await repos.transaction.confirm({
            typeOf: factory.transactionType.MoneyTransfer,
            id: transaction.id,
            authorizeActions: authorizeActions,
            result: {},
            potentialActions: potentialActions
        });
    };
}

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks(params: {
    project?: factory.project.IProject;
    status: factory.transactionStatusType;
}) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: factory.transactionType.MoneyTransfer,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        const tasks = await exportTasksById(transaction)(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}

/**
 * 取引のタスク出力
 */
export function exportTasksById(params: { id: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.MoneyTransfer,
            id: params.id
        });
        const potentialActions = transaction.potentialActions;

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

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
                                runsAt: now, // なるはやで実行
                                remainingNumberOfTries: 10,
                                numberOfTried: 0,
                                executionResults: [],
                                data: a
                            };
                        }));
                    }

                    // 口座決済
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray((<any>potentialActions).payAccount)) {
                        taskAttributes.push(...(<any>potentialActions).payAccount.map(
                            (a: any): factory.task.IAttributes<factory.taskName.PayAccount> => {
                                return {
                                    project: a.project,
                                    name: factory.taskName.PayAccount,
                                    status: factory.taskStatus.Ready,
                                    runsAt: now, // なるはやで実行
                                    remainingNumberOfTries: 10,
                                    numberOfTried: 0,
                                    executionResults: [],
                                    data: a
                                };
                            }));
                    }

                    // クレジットカード決済
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(potentialActions.payCreditCard)) {
                        taskAttributes.push(...potentialActions.payCreditCard.map(
                            (a): factory.task.IAttributes<factory.taskName.PayCreditCard> => {
                                return {
                                    project: a.project,
                                    name: factory.taskName.PayCreditCard,
                                    status: factory.taskStatus.Ready,
                                    runsAt: now, // なるはやで実行
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
                const cancelCreditCardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelCreditCard> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.CancelCreditCard,
                    status: factory.taskStatus.Ready,
                    runsAt: now,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };

                const cancelAccountTaskAttributes: factory.task.IAttributes<factory.taskName.CancelAccount> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.CancelAccount,
                    status: factory.taskStatus.Ready,
                    runsAt: now,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };

                const voidMoneyTransferTaskAttributes: factory.task.IAttributes<factory.taskName.VoidMoneyTransfer> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.VoidMoneyTransfer,
                    status: factory.taskStatus.Ready,
                    runsAt: now,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };

                taskAttributes.push(
                    cancelCreditCardTaskAttributes,
                    cancelAccountTaskAttributes,
                    voidMoneyTransferTaskAttributes
                );

                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
