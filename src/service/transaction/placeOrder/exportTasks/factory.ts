import * as factory from '../../../../factory';

/**
 * 取引のタスクを作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createTasks(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    runsAt: Date;
}): factory.task.IAttributes<factory.taskName>[] {
    const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

    const project = params.project;
    const transaction = params.transaction;
    const taskRunsAt = params.runsAt;

    const transactionWebhooks = (typeof project.settings?.transactionWebhookUrl === 'string')
        ? project.settings.transactionWebhookUrl.split(',')
        : [];
    const triggerWebhookTaskAttributes: factory.task.IAttributes<factory.taskName.TriggerWebhook>[] =
        transactionWebhooks.map((webhookUrl) => {
            return {
                project: { typeOf: params.project.typeOf, id: params.project.id },
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

            const voidRegisterServiceTaskAttributes: factory.task.IAttributes<factory.taskName.VoidRegisterService> = {
                project: { typeOf: project.typeOf, id: project.id },
                name: factory.taskName.VoidRegisterService,
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

            const voidPaymentTaskAttributes: factory.task.IAttributes<factory.taskName.VoidPayment> = {
                project: { typeOf: project.typeOf, id: project.id },
                name: factory.taskName.VoidPayment,
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
