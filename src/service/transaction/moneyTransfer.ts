/**
 * 通貨転送取引サービス
 */
import * as pecorino from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { createPotentialActions } from './moneyTransfer/potentialActions';

const debug = createDebug('cinerino-domain:service');

export type IStartOperation<T> = (repos: {
    accountService: pecorino.service.Account;
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
export function start(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.moneyTransfer.ITransaction<factory.accountType>> {
    return async (repos: {
        accountService: pecorino.service.Account;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`${params.agent.id} is starting transfer transaction...`);

        const seller = await repos.seller.findById({ id: params.seller.id });

        // let toLocation: factory.transaction.moneyTransfer.IToLocation<factory.accountType> | undefined;

        // if (params.object.toLocation.typeOf === factory.pecorino.account.TypeOf.Account) {
        //     // 口座存在確認
        //     const toLocationParams = <factory.action.transfer.moneyTransfer.IAccount<factory.accountType>>params.object.toLocation;
        //     const searchAccountsResult = await repos.accountService.searchWithTotalCount<factory.accountType>({
        //         limit: 1,
        //         accountType: toLocationParams.accountType,
        //         accountNumbers: [toLocationParams.accountNumber],
        //         statuses: [pecorino.factory.accountStatusType.Opened]
        //     });
        //     toLocation = searchAccountsResult.data.shift();
        //     if (toLocation === undefined) {
        //         throw new factory.errors.NotFound('Account', 'To Location Not Found');
        //     }
        // } else {
        //     toLocation = params.object.toLocation;
        // }

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
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
                // amount: params.object.amount,
                // toLocation: (toLocation.typeOf === factory.pecorino.account.TypeOf.Account)
                //     ? {
                //         typeOf: toLocation.typeOf,
                //         accountType: (<factory.action.transfer.moneyTransfer.IAccount<factory.accountType>>toLocation).accountType,
                //         accountNumber: (<factory.action.transfer.moneyTransfer.IAccount<factory.accountType>>toLocation).accountNumber,
                //         name: toLocation.name
                //     }
                //     : toLocation,
                authorizeActions: [],
                ...(typeof params.object.description === 'string') ? { description: params.object.description } : {}
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
                                project: transaction.project,
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
