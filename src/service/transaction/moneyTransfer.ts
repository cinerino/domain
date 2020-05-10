/**
 * 通貨転送取引サービス
 */
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as PaymentCardService from '../payment/paymentCard';

import { createPotentialActions } from './moneyTransfer/potentialActions';

export type IStartOperation<T> = (repos: {
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
export function start(
    params: factory.transaction.moneyTransfer.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.moneyTransfer.ITransaction> {
    return async (repos: {
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
            await PaymentCardService.authorize({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: fromLocation.typeOf,
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
            await PaymentCardService.authorize({
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                agent: { id: transaction.agent.id },
                object: {
                    amount: transaction.object.amount,
                    typeOf: fromLocation.typeOf,
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
            // if (fromLocationObject.accountType !== 'Coin') {
            //     throw new factory.errors.Argument('toLocation', `account type must be ${'Coin'}`);
            // }

            fromLocation = {
                typeOf: fromLocationObject.typeOf,
                identifier: fromLocationObject.identifier,
                ...{
                    accessCode: (<any>fromLocationObject).accessCode
                }
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
                // accountType: (<any>account).accountType,
                // name: account.name
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
                const cancelPaymentCardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelPaymentCard> = {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    name: factory.taskName.CancelPaymentCard,
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
                    cancelPaymentCardTaskAttributes
                );

                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
