/**
 * 注文サービス
 */
// import * as createDebug from 'debug';
// import * as moment from 'moment';

import * as chevre from '../chevre';
import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
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
        order: chevre.service.Order;
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
            // chevre連携
            await repos.order.createIfNotExist(order);

            // const authorizePaymentActions = (<factory.action.authorize.paymentMethod.any.IAction[]>
            //     placeOrderTransaction.object.authorizeActions)
            //     .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
            //         && a.result?.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment);

            // 請求書作成
            // const invoices: factory.invoice.IInvoice[] = [];

            // authorizePaymentActions.forEach((a) => {
            //     const result = (<factory.action.authorize.paymentMethod.any.IResult>a.result);

            //     // 決済方法と決済IDごとに金額をまとめて請求書を作成する
            //     const existingInvoiceIndex = invoices.findIndex((i) => {
            //         return i.paymentMethod === result.paymentMethod && i.paymentMethodId === result.paymentMethodId;
            //     });

            //     if (existingInvoiceIndex < 0) {
            //         invoices.push({
            //             project: order.project,
            //             typeOf: 'Invoice',
            //             accountId: result.accountId,
            //             confirmationNumber: order.confirmationNumber.toString(),
            //             customer: order.customer,
            //             paymentMethod: <any>result.paymentMethod,
            //             paymentMethodId: result.paymentMethodId,
            //             paymentStatus: result.paymentStatus,
            //             referencesOrder: order,
            //             totalPaymentDue: result.totalPaymentDue
            //         });
            //     } else {
            //         const existingInvoice = invoices[existingInvoiceIndex];
            //         if (existingInvoice.totalPaymentDue?.value !== undefined && result.totalPaymentDue?.value !== undefined) {
            //             existingInvoice.totalPaymentDue.value += result.totalPaymentDue.value;
            //         }
            //     }
            // });
            // await Promise.all(invoices.map(async (invoice) => {
            //     await repos.invoice.createIfNotExist(invoice);
            // }));
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

            // 決済タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.pay)) {
                taskAttributes.push(...potentialActions.pay.map(
                    (a): factory.task.IAttributes<factory.taskName.Pay> => {
                        return {
                            project: a.project,
                            name: factory.taskName.Pay,
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
        order: chevre.service.Order;
        ownershipInfo: chevre.service.OwnershipInfo;
        transaction: TransactionRepo;
        task: TaskRepo;
    }) => {
        const dateReturned = new Date();

        // let order = await repos.order.findByOrderNumber({ orderNumber: params.object.orderNumber });
        let order = await repos.order.findByOrderNumber({ orderNumber: params.object.orderNumber });

        const returnOrderActionAttributes = params;
        const returnedOwnershipInfos: factory.ownershipInfo.IOwnershipInfo<any>[] = [];

        // アクション開始
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
                        // chevre連携
                        await repos.ownershipInfo.updateByIdentifier({
                            project: { id: params.project.id },
                            identifier: String(ownershipInfo.identifier),
                            ownedThrough: dateReturned
                        });
                        returnedOwnershipInfos.push(ownershipInfo);
                    }));
                }
            }));

            // 注文ステータス変更(chevre連携)
            order = await repos.order.returnOrder({
                orderNumber: order.orderNumber,
                dateReturned: dateReturned,
                returner: returnOrderActionAttributes.agent
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
            if (Array.isArray(potentialActions.refund)) {
                taskAttributes.push(...potentialActions.refund.map(
                    (a): factory.task.IAttributes<factory.taskName.Refund> => {
                        return {
                            project: a.project,
                            name: factory.taskName.Refund,
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

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.sendEmailMessage)) {
                potentialActions.sendEmailMessage.forEach((s) => {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: s.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: s
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                });
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
