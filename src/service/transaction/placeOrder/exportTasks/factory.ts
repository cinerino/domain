import * as factory from '../../../../factory';

import { settings } from '../../../../settings';

/**
 * 取引のタスクを作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createTasks(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    runsAt: Date;
}): factory.task.IAttributes<factory.taskName>[] {
    const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

    const transaction = params.transaction;
    const taskRunsAt = params.runsAt;

    const transactionWebhookUrls = (Array.isArray(settings.transactionWebhookUrls)) ? settings.transactionWebhookUrls : [];
    const triggerWebhookTaskAttributes: factory.task.IAttributes<factory.taskName.TriggerWebhook>[] =
        transactionWebhookUrls.map((webhookUrl) => {
            return {
                project: transaction.project,
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
                        project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                        id: '',
                        name: { ja: webhookUrl, en: webhookUrl },
                        typeOf: factory.chevre.organizationType.Corporation,
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
                project: transaction.project,
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
            const voidReserveTaskAttributes: factory.task.IAttributes<factory.taskName.VoidReserveTransaction> = {
                project: transaction.project,
                name: factory.taskName.VoidReserveTransaction,
                status: factory.taskStatus.Ready,
                runsAt: taskRunsAt,
                remainingNumberOfTries: 10,
                numberOfTried: 0,
                executionResults: [],
                data: {
                    project: transaction.project,
                    purpose: { typeOf: transaction.typeOf, id: transaction.id }
                }
            };

            const voidRegisterServiceTaskAttributes: factory.task.IAttributes<factory.taskName.VoidRegisterServiceTransaction> = {
                project: transaction.project,
                name: factory.taskName.VoidRegisterServiceTransaction,
                status: factory.taskStatus.Ready,
                runsAt: taskRunsAt,
                remainingNumberOfTries: 10,
                numberOfTried: 0,
                executionResults: [],
                data: {
                    project: transaction.project,
                    purpose: { typeOf: transaction.typeOf, id: transaction.id }
                }
            };

            const voidPaymentTaskAttributes: factory.task.IAttributes<factory.taskName.VoidPayTransaction> = {
                project: transaction.project,
                name: factory.taskName.VoidPayTransaction,
                status: factory.taskStatus.Ready,
                runsAt: taskRunsAt,
                remainingNumberOfTries: 10,
                numberOfTried: 0,
                executionResults: [],
                data: {
                    project: transaction.project,
                    purpose: { typeOf: transaction.typeOf, id: transaction.id }
                }
            };

            const voidMoneyTransferTaskAttributes: factory.task.IAttributes<factory.taskName.VoidMoneyTransferTransaction> = {
                project: transaction.project,
                name: factory.taskName.VoidMoneyTransferTransaction,
                status: factory.taskStatus.Ready,
                runsAt: taskRunsAt,
                remainingNumberOfTries: 10,
                numberOfTried: 0,
                executionResults: [],
                data: {
                    project: transaction.project,
                    purpose: { typeOf: transaction.typeOf, id: transaction.id }
                }
            };

            taskAttributes.push(
                voidReserveTaskAttributes,
                voidRegisterServiceTaskAttributes,
                voidPaymentTaskAttributes,
                voidMoneyTransferTaskAttributes
            );
            break;

        default:
            throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
    }

    return taskAttributes;
}
