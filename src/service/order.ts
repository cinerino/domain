/**
 * 注文サービス
 */
// import * as createDebug from 'debug';
import * as moment from 'moment';

// import { credentials } from '../credentials';

// import * as chevre from '../chevre';
import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as InvoiceRepo } from '../repo/invoice';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

// import * as COA from '../coa';

// const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

/**
 * 注文取引から注文を作成する
 */
export function placeOrder(params: factory.action.trade.order.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const order = params.object;
        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            result: { order: { orderNumbers: [order.orderNumber] } }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        // アクション開始
        const orderActionAttributes = params;
        const action = await repos.action.start(orderActionAttributes);

        try {
            // 注文保管
            await repos.order.createIfNotExist(order);

            // 請求書作成
            const invoices: factory.invoice.IInvoice[] = [];
            Object.keys(factory.paymentMethodType)
                .forEach((key) => {
                    const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
                    placeOrderTransaction.object.authorizeActions
                        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                        .filter((a) => a.result !== undefined)
                        .filter((a) => a.result.paymentMethod === paymentMethodType)
                        .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                            const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);

                            // 決済方法と決済IDごとに金額をまとめて請求書を作成する
                            const existingInvoiceIndex = invoices.findIndex((i) => {
                                return i.paymentMethod === paymentMethodType && i.paymentMethodId === result.paymentMethodId;
                            });

                            if (existingInvoiceIndex < 0) {
                                invoices.push({
                                    project: order.project,
                                    typeOf: 'Invoice',
                                    accountId: result.accountId,
                                    confirmationNumber: order.confirmationNumber.toString(),
                                    customer: order.customer,
                                    paymentMethod: paymentMethodType,
                                    paymentMethodId: result.paymentMethodId,
                                    paymentStatus: result.paymentStatus,
                                    referencesOrder: order,
                                    totalPaymentDue: result.totalPaymentDue
                                });
                            } else {
                                const existingInvoice = invoices[existingInvoiceIndex];
                                if (
                                    existingInvoice.totalPaymentDue !== undefined
                                    && existingInvoice.totalPaymentDue.value !== undefined
                                    && result.totalPaymentDue !== undefined
                                    && result.totalPaymentDue.value !== undefined
                                ) {
                                    existingInvoice.totalPaymentDue.value += result.totalPaymentDue.value;
                                }
                            }
                        });
                });

            await Promise.all(invoices.map(async (invoice) => {
                await repos.invoice.createIfNotExist(invoice);
            }));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: orderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        await repos.action.complete({ typeOf: orderActionAttributes.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onPlaceOrder(orderActionAttributes)(repos);
    };
}

/**
 * 注文作成後のアクション
 */
function onPlaceOrder(orderActionAttributes: factory.action.trade.order.IAttributes) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
    }) => {
        const potentialActions = orderActionAttributes.potentialActions;
        const now = new Date();

        // potentialActionsのためのタスクを生成
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendOrder !== undefined) {
                const sendOrderTask: factory.task.IAttributes<factory.taskName.SendOrder> = {
                    project: potentialActions.sendOrder.project,
                    name: factory.taskName.SendOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: potentialActions.sendOrder
                };
                taskAttributes.push(sendOrderTask);
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

            // 口座決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.payAccount)) {
                taskAttributes.push(...potentialActions.payAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.PayAccount> => {
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

            // ムビチケ決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.payMovieTicket)) {
                taskAttributes.push(...potentialActions.payMovieTicket.map(
                    (a): factory.task.IAttributes<factory.taskName.PayMovieTicket> => {
                        return {
                            project: a.project,
                            name: factory.taskName.PayMovieTicket,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // ポイント付与
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.givePointAward)) {
                taskAttributes.push(...potentialActions.givePointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.GivePointAward> => {
                        return {
                            project: a.project,
                            name: factory.taskName.GivePointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            if (Array.isArray(potentialActions.informOrder)) {
                taskAttributes.push(...potentialActions.informOrder.map(
                    (a): factory.task.IAttributes<factory.taskName.TriggerWebhook> => {
                        return {
                            project: a.project,
                            name: factory.taskName.TriggerWebhook,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    })
                );
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}

/**
 * 注文返品アクション
 */
export function returnOrder(params: factory.task.IData<factory.taskName.ReturnOrder>) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        ownershipInfo: OwnershipInfoRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
    }) => {
        // 確定済の注文返品取引がひとつあるはず
        const returnOrderTransactions = await repos.transaction.search<factory.transactionType.ReturnOrder>({
            limit: 1,
            typeOf: factory.transactionType.ReturnOrder,
            object: {
                order: { orderNumbers: [params.orderNumber] }
            },
            statuses: [factory.transactionStatusType.Confirmed]
        });
        const returnOrderTransaction = returnOrderTransactions.shift();
        if (returnOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Return order transaction');
        }

        const dateReturned = moment(returnOrderTransaction.endDate)
            .toDate();

        const potentialActions = returnOrderTransaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('PotentialActions of return order transaction');
        }

        // アクション開始
        let order = returnOrderTransaction.object.order;
        const returnOrderActionAttributes = potentialActions.returnOrder;
        const returnedOwnershipInfos: factory.ownershipInfo.IOwnershipInfo<any>[] = [];

        const action = await repos.action.start(returnOrderActionAttributes);

        try {
            // 所有権の所有期間変更
            const sendOrderActions = <factory.action.transfer.send.order.IAction[]>await repos.action.search({
                typeOf: factory.actionType.SendAction,
                object: { orderNumber: { $in: [order.orderNumber] } },
                actionStatusTypes: [factory.actionStatusType.CompletedActionStatus]
            });

            await Promise.all(sendOrderActions.map(async (a) => {
                const ownershipInfos = a.result;
                if (Array.isArray(ownershipInfos)) {
                    await Promise.all(ownershipInfos.map(async (ownershipInfo) => {
                        const doc = await repos.ownershipInfo.ownershipInfoModel.findOneAndUpdate(
                            { _id: ownershipInfo.id },
                            { ownedThrough: dateReturned },
                            { new: true }
                        )
                            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
                            .exec();
                        if (doc !== null) {
                            returnedOwnershipInfos.push(doc.toObject());
                        }
                    }));
                }
            }));

            // 注文ステータス変更
            order = await repos.order.returnOrder({
                orderNumber: order.orderNumber,
                dateReturned: dateReturned
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        const result: factory.action.transfer.returnAction.order.IResult = returnedOwnershipInfos;
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        // 潜在アクション
        await onReturn(returnOrderActionAttributes, order)({ task: repos.task });
    };
}

/**
 * 返品アクション後の処理
 * 注文返品後に何をすべきかは返品アクションのpotentialActionsとして定義されているはずなので、それらをタスクとして登録します。
 */
export function onReturn(
    returnActionAttributes: factory.action.transfer.returnAction.order.IAttributes,
    order: factory.order.IOrder
) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
    }) => {
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        const potentialActions = returnActionAttributes.potentialActions;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.cancelReservation)) {
                taskAttributes.push(...potentialActions.cancelReservation.map(
                    (a): factory.task.IAttributes<factory.taskName.CancelReservation> => {
                        return {
                            project: a.project,
                            name: factory.taskName.CancelReservation,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.refundCreditCard)) {
                taskAttributes.push(...potentialActions.refundCreditCard.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundCreditCard> => {
                        return {
                            project: a.project,
                            name: factory.taskName.RefundCreditCard,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // 口座返金タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.refundAccount)) {
                taskAttributes.push(...potentialActions.refundAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundAccount> => {
                        return {
                            project: a.project,
                            name: factory.taskName.RefundAccount,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // 口座返金タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.refundMovieTicket)) {
                taskAttributes.push(...potentialActions.refundMovieTicket.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundMovieTicket> => {
                        return {
                            project: a.project,
                            name: factory.taskName.RefundMovieTicket,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // Pecorinoインセンティブ返却タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.returnPointAward)) {
                taskAttributes.push(...potentialActions.returnPointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.ReturnPointAward> => {
                        return {
                            project: a.project,
                            name: factory.taskName.ReturnPointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            if (Array.isArray(potentialActions.informOrder)) {
                taskAttributes.push(...potentialActions.informOrder.map(
                    (a): factory.task.IAttributes<factory.taskName.TriggerWebhook> => {
                        return {
                            project: a.project,
                            name: factory.taskName.TriggerWebhook,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: {
                                ...a,
                                object: order
                            }
                        };
                    })
                );
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
