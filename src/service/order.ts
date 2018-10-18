/**
 * 注文サービス
 */
import * as createDebug from 'debug';

import * as chevre from '../chevre';
import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 注文取引結果から注文を作成する
 * @param transactionId 注文取引ID
 */
export function createFromTransaction(params: { transactionId: string }) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
    }) => {
        const transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });
        const transactionResult = transaction.result;
        if (transactionResult === undefined) {
            throw new factory.errors.NotFound('transaction.result');
        }
        const potentialActions = transaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('transaction.potentialActions');
        }

        // アクション開始
        const orderActionAttributes = potentialActions.order;
        const action = await repos.action.start(orderActionAttributes);

        try {
            // 注文保管
            await repos.order.createIfNotExist(transactionResult.order);
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

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: orderActionAttributes.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onCreate(params.transactionId, orderActionAttributes)({ task: repos.task });
    };
}

/**
 * 注文作成後のアクション
 * @param transactionId 注文取引ID
 * @param orderActionAttributes 注文アクション属性
 */
function onCreate(transactionId: string, orderActionAttributes: factory.action.trade.order.IAttributes) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: { task: TaskRepo }) => {
        // potentialActionsのためのタスクを生成
        const orderPotentialActions = orderActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (orderPotentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (orderPotentialActions.sendOrder !== undefined) {
                const sendOrderTask: factory.task.IAttributes<factory.taskName.SendOrder> = {
                    name: factory.taskName.SendOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transactionId
                    }
                };
                taskAttributes.push(sendOrderTask);
            }

            // クレジットカード決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (orderPotentialActions.payCreditCard !== undefined) {
                const payCreditCardTask: factory.task.IAttributes<factory.taskName.PayCreditCard> = {
                    name: factory.taskName.PayCreditCard,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transactionId
                    }
                };
                taskAttributes.push(payCreditCardTask);
            }

            // Pecorino決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payAccount)) {
                taskAttributes.push(...orderPotentialActions.payAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.PayAccount> => {
                        return {
                            name: factory.taskName.PayAccount,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // Mocoin決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payMocoin)) {
                taskAttributes.push(...orderPotentialActions.payMocoin.map(
                    (a): factory.task.IAttributes<factory.taskName.PayMocoin> => {
                        return {
                            name: factory.taskName.PayMocoin,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // ムビチケ決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payMovieTicket)) {
                taskAttributes.push(...orderPotentialActions.payMovieTicket.map(
                    (a): factory.task.IAttributes<factory.taskName.PayMovieTicket> => {
                        return {
                            name: factory.taskName.PayMovieTicket,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // Pecorinoポイント付与
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.givePointAward)) {
                taskAttributes.push(...orderPotentialActions.givePointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.GivePointAward> => {
                        return {
                            name: factory.taskName.GivePointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
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
export function cancelReservations(params: { orderNumber: string }) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
        cancelReservationService: chevre.service.transaction.CancelReservation;
    }) => {
        const returnOrderTransactions = await repos.transaction.search<factory.transactionType.ReturnOrder>({
            typeOf: factory.transactionType.ReturnOrder,
            object: {
                order: { orderNumbers: [params.orderNumber] }
            }
        });
        const returnOrderTransaction = returnOrderTransactions.shift();
        if (returnOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Return order transaction');
        }
        const potentialActions = returnOrderTransaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('PotentialActions of return order transaction');
        }

        // アクション開始
        const returnOrderActionAttributes = potentialActions.returnOrder;
        const action = await repos.action.start(returnOrderActionAttributes);
        try {
            const order = returnOrderTransaction.object.order;

            // 予約キャンセル確定
            const cancelReservationTransactions = returnOrderTransaction.object.pendingCancelReservationTransactions;
            if (cancelReservationTransactions !== undefined) {
                await Promise.all(cancelReservationTransactions.map(async (cancelReservationTransaction) => {
                    await repos.cancelReservationService.confirm({ transactionId: cancelReservationTransaction.id });
                }));
            }

            // 注文ステータス変更
            debug('changing orderStatus...');
            await repos.order.changeStatus(order.orderNumber, factory.orderStatus.OrderReturned);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: returnOrderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: returnOrderActionAttributes.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onReturn(returnOrderTransaction.id, returnOrderActionAttributes)({ task: repos.task });
    };
}

/**
 * 返品アクション後の処理
 * 注文返品後に何をすべきかは返品アクションのpotentialActionsとして定義されているはずなので、それらをタスクとして登録します。
 * @param transactionId 注文返品取引ID
 * @param returnActionAttributes 返品アクション属性
 */
function onReturn(transactionId: string, returnActionAttributes: factory.action.transfer.returnAction.order.IAttributes) {
    return async (repos: {
        task: TaskRepo;
    }) => {
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (returnActionAttributes.potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (returnActionAttributes.potentialActions.refundCreditCard !== undefined) {
                // 返金タスク作成
                const task: factory.task.IAttributes<factory.taskName.RefundCreditCard> = {
                    name: factory.taskName.RefundCreditCard,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transactionId: transactionId
                    }
                };
                taskAttributes.push(task);
            }

            // 口座返金タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(returnActionAttributes.potentialActions.refundAccount)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.refundAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundAccount> => {
                        return {
                            name: factory.taskName.RefundAccount,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
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
            if (Array.isArray(returnActionAttributes.potentialActions.returnPointAward)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.returnPointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.ReturnPointAward> => {
                        return {
                            name: factory.taskName.ReturnPointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
