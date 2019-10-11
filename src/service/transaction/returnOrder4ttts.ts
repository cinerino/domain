/**
 * 注文返品サービス
 */
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ReturnOrderService from './returnOrder';

export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    invoice: InvoiceRepo;
    order: OrderRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type ITaskAndTransactionOperation<T> = (
    taskRepo: TaskRepo, transactionRepo: TransactionRepo
) => Promise<T>;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

export import start = ReturnOrderService.start;
export import confirm = ReturnOrderService.confirm;
export import exportTasks = ReturnOrderService.exportTasks;
export import exportTasksById = ReturnOrderService.exportTasksById;

/**
 * 確定取引についてメールを送信する
 */
export function sendEmail(
    transactionId: string,
    emailMessageAttributes: factory.creativeWork.message.email.IAttributes
): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName.SendEmailMessage>> {
    return async (taskRepo: TaskRepo, transactionRepo: TransactionRepo) => {
        const returnOrderTransaction: factory.transaction.returnOrder.ITransaction = <any>
            await transactionRepo.findById({ typeOf: factory.transactionType.ReturnOrder, id: transactionId });
        if (returnOrderTransaction.status !== factory.transactionStatusType.Confirmed) {
            throw new factory.errors.Forbidden('Transaction not confirmed.');
        }

        // const placeOrderTransaction = returnOrderTransaction.object.transaction;
        // if (placeOrderTransaction.result === undefined) {
        //     throw new factory.errors.NotFound('PlaceOrder Transaction Result');
        // }
        const order = returnOrderTransaction.object.order;

        const emailMessage: factory.creativeWork.message.email.ICreativeWork = {
            typeOf: factory.creativeWorkType.EmailMessage,
            identifier: `returnOrderTransaction-${transactionId}`,
            name: `returnOrderTransaction-${transactionId}`,
            sender: {
                typeOf: order.seller.typeOf,
                name: emailMessageAttributes.sender.name,
                email: emailMessageAttributes.sender.email
            },
            toRecipient: {
                typeOf: order.customer.typeOf,
                name: emailMessageAttributes.toRecipient.name,
                email: emailMessageAttributes.toRecipient.email
            },
            about: emailMessageAttributes.about,
            text: emailMessageAttributes.text
        };

        // その場で送信ではなく、DBにタスクを登録
        const taskAttributes: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
            name: factory.taskName.SendEmailMessage,
            project: returnOrderTransaction.project,
            status: factory.taskStatus.Ready,
            runsAt: new Date(), // なるはやで実行
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: {
                actionAttributes: {
                    agent: {
                        id: order.seller.id,
                        name: { ja: order.seller.name, en: '' },
                        project: returnOrderTransaction.project,
                        typeOf: order.seller.typeOf
                    },
                    object: emailMessage,
                    project: returnOrderTransaction.project,
                    purpose: {
                        typeOf: order.typeOf,
                        orderNumber: order.orderNumber
                    },
                    recipient: {
                        id: order.customer.id,
                        name: order.customer.name,
                        typeOf: order.customer.typeOf
                    },
                    typeOf: factory.actionType.SendAction
                }
                // transactionId: transactionId,
                // emailMessage: emailMessage
            }
        };

        return <any>await taskRepo.save(taskAttributes);
    };
}
