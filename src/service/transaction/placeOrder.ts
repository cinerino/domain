/**
 * 注文取引サービス
 */
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ITaskAndTransactionOperation<T> = (repos: {
    project: ProjectRepo;
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引のタスクを出力します
 */
export function exportTasksById(params: {
    id: string;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
}): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        const project = await repos.project.findById({ id: transaction.project.id });

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // タスク実行日時バッファの指定があれば調整
        let taskRunsAt = new Date();
        if (typeof params.runsTasksAfterInSeconds === 'number') {
            taskRunsAt = moment(taskRunsAt)
                .add(params.runsTasksAfterInSeconds, 'seconds')
                .toDate();
        }

        const transactionWebhooks = (project.settings !== undefined && typeof project.settings.transactionWebhookUrl === 'string')
            ? project.settings.transactionWebhookUrl.split(',')
            : [];
        const triggerWebhookTaskAttributes: factory.task.IAttributes<factory.taskName.TriggerWebhook>[] =
            transactionWebhooks.map((webhookUrl) => {
                return {
                    project: project,
                    name: factory.taskName.TriggerWebhook,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 3,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        agent: transaction.seller,
                        object: transaction,
                        project: transaction.project,
                        purpose: { typeOf: transaction.typeOf, id: transaction.id },
                        recipient: {
                            project: transaction.project,
                            id: '',
                            name: { ja: webhookUrl, en: webhookUrl },
                            typeOf: factory.organizationType.Corporation,
                            url: webhookUrl
                        },
                        typeOf: factory.actionType.InformAction
                    }
                };
            });

        taskAttributes.push(...triggerWebhookTaskAttributes);

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                const potentialActions = transaction.potentialActions;
                if (potentialActions === undefined) {
                    throw new factory.errors.NotFound('Transaction PotentialActions');
                }
                const orderActionAttributes = potentialActions.order;
                const placeOrderTaskAttributes: factory.task.IAttributes<factory.taskName.PlaceOrder> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.PlaceOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: orderActionAttributes
                };
                taskAttributes.push(
                    placeOrderTaskAttributes
                );
                break;

            // 期限切れor中止の場合は、タスクリストを作成する
            case factory.transactionStatusType.Canceled:
            case factory.transactionStatusType.Expired:
                const cancelSeatReservationTaskAttributes: factory.task.IAttributes<factory.taskName.CancelSeatReservation> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.CancelSeatReservation,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                const cancelCreditCardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelCreditCard> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.CancelCreditCard,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                const cancelAccountTaskAttributes: factory.task.IAttributes<factory.taskName.CancelAccount> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.CancelAccount,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                const cancelPointAwardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelPointAward> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.CancelPointAward,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                const voidMoneyTransferTaskAttributes: factory.task.IAttributes<factory.taskName.VoidMoneyTransfer> = {
                    project: { typeOf: project.typeOf, id: project.id },
                    name: factory.taskName.VoidMoneyTransfer,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                taskAttributes.push(
                    cancelSeatReservationTaskAttributes,
                    cancelCreditCardTaskAttributes,
                    cancelAccountTaskAttributes,
                    cancelPointAwardTaskAttributes,
                    voidMoneyTransferTaskAttributes
                );
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }
        debug('taskAttributes prepared', taskAttributes);

        return Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}

/**
 * 確定取引についてメールを送信する
 * @deprecated どこかのバージョンで廃止予定
 */
export function sendEmail(
    transactionId: string,
    emailMessageAttributes: factory.creativeWork.message.email.IAttributes
): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName.SendEmailMessage>> {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: transactionId
        });
        if (transaction.status !== factory.transactionStatusType.Confirmed) {
            throw new factory.errors.Forbidden('Transaction not confirmed.');
        }
        const transactionResult = transaction.result;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        if (transactionResult === undefined) {
            throw new factory.errors.NotFound('transaction.result');
        }

        const emailMessage: factory.creativeWork.message.email.ICreativeWork = {
            typeOf: factory.creativeWorkType.EmailMessage,
            identifier: `placeOrderTransaction-${transactionId}`,
            name: `placeOrderTransaction-${transactionId}`,
            sender: {
                typeOf: transaction.seller.typeOf,
                name: emailMessageAttributes.sender.name,
                email: emailMessageAttributes.sender.email
            },
            toRecipient: {
                typeOf: transaction.agent.typeOf,
                name: emailMessageAttributes.toRecipient.name,
                email: emailMessageAttributes.toRecipient.email
            },
            about: emailMessageAttributes.about,
            text: emailMessageAttributes.text
        };
        const actionAttributes: factory.action.transfer.send.message.email.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.SendAction,
            object: emailMessage,
            agent: transaction.seller,
            recipient: transaction.agent,
            potentialActions: {},
            purpose: transactionResult.order
        };

        // その場で送信ではなく、DBにタスクを登録
        const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
            project: actionAttributes.project,
            name: factory.taskName.SendEmailMessage,
            status: factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: {
                actionAttributes: actionAttributes
            }
        };

        return <factory.task.ITask<factory.taskName.SendEmailMessage>>await repos.task.save(sendEmailMessageTask);
    };
}
