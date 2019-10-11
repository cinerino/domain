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

import { createPotentialActions } from './returnOrder/potentialActions';
// import { createPotentialActions } from './returnOrder/potentialActions4ttts';

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
// export import confirm = ReturnOrderService.confirm;
export import exportTasks = ReturnOrderService.exportTasks;
export import exportTasksById = ReturnOrderService.exportTasksById;

/**
 * 取引確定
 */
export function confirm(params: factory.transaction.returnOrder.IConfirmParams) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        seller: SellerRepo;
    }) => {
        let transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transaction', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transaction', 'Transaction already canceled');
        }

        if (params.agent !== undefined && params.agent.id !== undefined) {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        const order = transaction.object.order;
        const seller = await repos.seller.findById(
            { id: order.seller.id },
            { paymentAccepted: 0 } // 決済情報は不要
        );

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            limit: 1,
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });

        const result: factory.transaction.returnOrder.IResult = {};
        const potentialActions = await createPotentialActions({
            actionsOnOrder: actionsOnOrder,
            potentialActions: params.potentialActions,
            seller: seller,
            transaction: transaction,
            placeOrderTransaction: placeOrderTransaction
        });

        // ステータス変更
        transaction = await repos.transaction.confirm({
            typeOf: transaction.typeOf,
            id: transaction.id,
            authorizeActions: [],
            result: result,
            potentialActions: potentialActions
        });

        return transaction.result;
    };
}

/**
 * 予約キャンセル処理
 */
export function confirm4ttts(params: {
    project: factory.project.IProject;
    /**
     * 主体者ID
     */
    agentId: string;
    /**
     * APIクライアント
     */
    clientUser: factory.clientUser.IClientUser;
    expires: Date;
    order: { orderNumber: string };
    /**
     * キャンセル手数料
     */
    cancellationFee: number;
    /**
     * 強制的に返品するかどうか
     * 管理者の判断で返品する場合、バリデーションをかけない
     */
    // forcibly: boolean;
    /**
     * 返品理由
     */
    reason: factory.transaction.returnOrder.Reason;
    seller: {
        typeOf: factory.organizationType;
        id: string;
    };
    /**
     * 取引確定後アクション
     */
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
}): IConfirmOperation<factory.transaction.returnOrder.ITransaction> {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        // 取引開始
        let returnOrderTransaction: factory.transaction.returnOrder.ITransaction;
        try {
            returnOrderTransaction = await start({
                project: params.project,
                expires: params.expires,
                agent: { typeOf: factory.personType.Person, id: params.agentId },
                object: {
                    clientUser: params.clientUser,
                    order: params.order,
                    cancellationFee: params.cancellationFee,
                    reason: params.reason
                },
                seller: params.seller
            })(repos);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 同一取引に対して返品取引を作成しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error ...',
                // code: 11000,

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['object.transaction'], 'Already returned.');
                }
            }

            throw error;
        }

        const order = returnOrderTransaction.object.order;
        const seller = await repos.seller.findById(
            { id: order.seller.id },
            { paymentAccepted: 0 } // 決済情報は不要
        );

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            limit: 1,
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });

        const result: factory.transaction.returnOrder.IResult = {};
        const potentialActions = await createPotentialActions({
            actionsOnOrder: actionsOnOrder,
            potentialActions: params.potentialActions,
            seller: seller,
            transaction: returnOrderTransaction,
            placeOrderTransaction: placeOrderTransaction
        });

        // ステータス変更
        returnOrderTransaction = await repos.transaction.confirm({
            typeOf: returnOrderTransaction.typeOf,
            id: returnOrderTransaction.id,
            authorizeActions: [],
            result: result,
            potentialActions: potentialActions
        });

        return returnOrderTransaction;
    };
}

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
