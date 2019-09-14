/**
 * 注文取引サービス
 */
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks(params: {
    project?: factory.project.IProject;
    status: factory.transactionStatusType;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
}) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: factory.transactionType.PlaceOrder,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        const tasks = await exportTasksById({
            id: transaction.id,
            runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
        })(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}

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
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        const project: factory.project.IProject = transaction.project;

        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // タスク実行日時バッファの指定があれば調整
        let taskRunsAt = new Date();
        if (typeof params.runsTasksAfterInSeconds === 'number') {
            taskRunsAt = moment(taskRunsAt)
                .add(params.runsTasksAfterInSeconds, 'seconds')
                .toDate();
        }

        // ウェブフックタスクを追加
        const webhookUrl =
            // tslint:disable-next-line:max-line-length
            `${process.env.TELEMETRY_API_ENDPOINT}/organizations/project/${project.id}/tasks/analyzePlaceOrder`;
        const triggerWebhookTaskAttributes: factory.task.IAttributes<factory.taskName.TriggerWebhook> = {
            project: project,
            name: factory.taskName.TriggerWebhook,
            status: factory.taskStatus.Ready,
            runsAt: taskRunsAt,
            remainingNumberOfTries: 3,
            numberOfTried: 0,
            executionResults: [],
            data: {
                agent: transaction.seller,
                object: { transaction: transaction },
                project: transaction.project,
                purpose: { typeOf: transaction.typeOf, id: transaction.id },
                recipient: {
                    project: transaction.project,
                    id: '',
                    name: { ja: 'Cinerino Telemetry', en: 'Cinerino Telemetry' },
                    typeOf: factory.organizationType.Corporation,
                    url: webhookUrl
                },
                typeOf: factory.actionType.InformAction
            }
        };
        taskAttributes.push(
            triggerWebhookTaskAttributes
        );

        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                const potentialActions = transaction.potentialActions;
                if (potentialActions === undefined) {
                    throw new factory.errors.NotFound('Transaction PotentialActions');
                }
                const orderActionAttributes = potentialActions.order;
                const placeOrderTaskAttributes: factory.task.IAttributes<factory.taskName.PlaceOrder> = {
                    project: project,
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
                    project: project,
                    name: factory.taskName.CancelSeatReservation,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: project,
                        purpose: { typeOf: transaction.typeOf, id: transaction.id },
                        transactionId: transaction.id
                    }
                };
                const cancelCreditCardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelCreditCard> = {
                    project: project,
                    name: factory.taskName.CancelCreditCard,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: project,
                        purpose: { typeOf: transaction.typeOf, id: transaction.id },
                        transactionId: transaction.id
                    }
                };
                const cancelAccountTaskAttributes: factory.task.IAttributes<factory.taskName.CancelAccount> = {
                    project: project,
                    name: factory.taskName.CancelAccount,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: project,
                        purpose: { typeOf: transaction.typeOf, id: transaction.id },
                        transactionId: transaction.id
                    }
                };
                const cancelPointAwardTaskAttributes: factory.task.IAttributes<factory.taskName.CancelPointAward> = {
                    project: project,
                    name: factory.taskName.CancelPointAward,
                    status: factory.taskStatus.Ready,
                    runsAt: taskRunsAt,
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: project,
                        purpose: { typeOf: transaction.typeOf, id: transaction.id },
                        transactionId: transaction.id
                    }
                };
                taskAttributes.push(
                    cancelSeatReservationTaskAttributes,
                    cancelCreditCardTaskAttributes,
                    cancelAccountTaskAttributes,
                    cancelPointAwardTaskAttributes
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
