/**
 * 通貨転送取引サービス
 */
import * as pecorino from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IStartOperation<T> = (repos: {
    accountService: pecorino.service.Account;
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
export function start(
    params: factory.transaction.IStartParams<factory.transactionType.MoneyTransfer>
): IStartOperation<factory.transaction.moneyTransfer.ITransaction<factory.accountType>> {
    return async (repos: {
        accountService: pecorino.service.Account;
        transaction: TransactionRepo;
    }) => {
        debug(`${params.agent.id} is starting transfer transaction... amount:${params.object.amount}`);

        // 口座存在確認
        const searchAccountsResult = await repos.accountService.searchWithTotalCount<factory.accountType>({
            limit: 1,
            accountType: params.object.toLocation.accountType,
            accountNumbers: [params.object.toLocation.accountNumber],
            statuses: [pecorino.factory.accountStatusType.Opened]
        });
        const toLocation = searchAccountsResult.data.shift();
        if (toLocation === undefined) {
            throw new factory.errors.NotFound('Account', 'To Location Not Found');
        }

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const startParams: factory.transaction.IStartParams<factory.transactionType.MoneyTransfer> = {
            typeOf: factory.transactionType.MoneyTransfer,
            agent: params.agent,
            recipient: params.recipient,
            object: {
                clientUser: params.object.clientUser,
                amount: params.object.amount,
                toLocation: {
                    typeOf: toLocation.typeOf,
                    accountType: toLocation.accountType,
                    accountNumber: toLocation.accountNumber
                },
                description: params.object.description,
                authorizeActions: []
            },
            expires: params.expires
        };

        // 取引作成
        let transaction: factory.transaction.moneyTransfer.ITransaction<factory.accountType>;
        try {
            transaction = await repos.transaction.start<factory.transactionType.MoneyTransfer>(startParams);
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
        //     throw new factory.errors.Forbidden('A specified transaction is not yours');
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

        // まずは一承認アクションのみ対応
        const completedAuthorizeActions = authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);
        if (completedAuthorizeActions.length !== 1) {
            throw new factory.errors.Argument('Transaction', 'Number of authorize actions must be 1');
        }

        // 取引で指定された転送先口座への転送取引承認金額が合致しているかどうか確認
        type IFromAccount = factory.action.authorize.paymentMethod.account.IAccount<factory.accountType>;
        const authorizeAccountPaymentActions =
            (<factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>transaction.object.authorizeActions)
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === factory.paymentMethodType.Account)
                .filter((a) => (<IFromAccount>a.object.fromAccount).accountType === transaction.object.toLocation.accountType)
                .filter((a) => {
                    return a.object.toAccount !== undefined
                        && a.object.toAccount.accountType === transaction.object.toLocation.accountType
                        && a.object.toAccount.accountNumber === transaction.object.toLocation.accountNumber;
                });
        const authorizedAmount = authorizeAccountPaymentActions.reduce((a, b) => a + b.object.amount, 0);

        if (authorizedAmount !== transaction.object.amount) {
            throw new factory.errors.Argument('Transaction', 'Authorized amount not matched');
        }

        // 通貨転送アクション属性作成
        const moneyTransferActionAttributesList: factory.action.transfer.moneyTransfer.IAttributes<T>[] =
            authorizeAccountPaymentActions.map((a) => {
                const fromLocationName = (a.agent.name !== undefined)
                    ? (typeof a.agent.name === 'string') ? a.agent.name : a.agent.name.ja
                    : undefined;
                const actionResult = <factory.action.authorize.paymentMethod.account.IResult<T>>a.result;

                return {
                    typeOf: <factory.actionType.MoneyTransfer>factory.actionType.MoneyTransfer,
                    description: transaction.object.description,
                    result: {},
                    object: {
                        pendingTransaction: actionResult.pendingTransaction
                    },
                    agent: transaction.agent,
                    recipient: transaction.recipient,
                    amount: transaction.object.amount,
                    fromLocation: {
                        typeOf: factory.pecorino.account.TypeOf.Account,
                        accountType: (<IFromAccount>a.object.fromAccount).accountType,
                        accountNumber: (<IFromAccount>a.object.fromAccount).accountNumber,
                        name: fromLocationName
                    },
                    toLocation: transaction.object.toLocation,
                    purpose: {
                        typeOf: transaction.typeOf,
                        id: transaction.id
                    }
                };
            });

        const potentialActions: factory.transaction.IPotentialActions<factory.transactionType.MoneyTransfer> = {
            moneyTransfer: moneyTransferActionAttributesList
        };

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
export function exportTasks(status: factory.transactionStatusType) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({ typeOf: factory.transactionType.MoneyTransfer, status: status });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById(transaction)(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });
    };
}

/**
 * 取引のタスク出力
 */
export function exportTasksById(params: { id: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {

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
                                name: <factory.taskName.MoneyTransfer>factory.taskName.MoneyTransfer,
                                status: factory.taskStatus.Ready,
                                runsAt: new Date(), // なるはやで実行
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
                // const cancelMoneyTransferTask: factory.task.cancelMoneyTransfer.IAttributes = {
                //     name: factory.taskName.CancelMoneyTransfer,
                //     status: factory.taskStatus.Ready,
                //     runsAt: new Date(), // なるはやで実行
                //     remainingNumberOfTries: 10,
                //     numberOfTried: 0,
                //     executionResults: [],
                //     data: {
                //         transaction: { typeOf: transaction.typeOf, id: transaction.id }
                //     }
                // };
                // taskAttributes.push(cancelMoneyTransferTask);
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }
        debug('taskAttributes prepared', taskAttributes);

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
