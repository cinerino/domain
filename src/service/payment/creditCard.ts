/**
 * クレジットカード決済サービス
 */
import * as factory from '@cinerino/factory';
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:*');

/**
 * クレジットカード売上確定
 * @param transactionId 取引ID
 */
export function payCreditCard(transactionId: string) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById(factory.transactionType.PlaceOrder, transactionId);
        const transactionResult = transaction.result;
        if (transactionResult === undefined) {
            throw new factory.errors.NotFound('transaction.result');
        }
        const potentialActions = transaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('transaction.potentialActions');
        }
        const orderPotentialActions = potentialActions.order.potentialActions;
        if (orderPotentialActions === undefined) {
            throw new factory.errors.NotFound('order.potentialActions');
        }

        const payActionAttributes = orderPotentialActions.payCreditCard;
        if (payActionAttributes !== undefined) {
            // クレジットカード承認アクションがあるはず
            const authorizeAction = <factory.action.authorize.paymentMethod.creditCard.IAction>transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .find((a) => a.object.typeOf === factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard);

            // アクション開始
            const action = await repos.action.start(payActionAttributes);

            let alterTranResult: GMO.services.credit.IAlterTranResult;
            try {
                const entryTranArgs = (<factory.action.authorize.paymentMethod.creditCard.IResult>authorizeAction.result).entryTranArgs;
                const execTranArgs = (<factory.action.authorize.paymentMethod.creditCard.IResult>authorizeAction.result).execTranArgs;

                // 取引状態参照
                const searchTradeResult = await GMO.services.credit.searchTrade({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    orderId: entryTranArgs.orderId
                });

                if (searchTradeResult.jobCd === GMO.utils.util.JobCd.Sales) {
                    debug('already in SALES');
                    // すでに実売上済み
                    alterTranResult = {
                        accessId: searchTradeResult.accessId,
                        accessPass: searchTradeResult.accessPass,
                        forward: searchTradeResult.forward,
                        approve: searchTradeResult.approve,
                        tranId: searchTradeResult.tranId,
                        tranDate: ''
                    };
                } else {
                    debug('calling alterTran...');
                    alterTranResult = await GMO.services.credit.alterTran({
                        shopId: entryTranArgs.shopId,
                        shopPass: entryTranArgs.shopPass,
                        accessId: execTranArgs.accessId,
                        accessPass: execTranArgs.accessPass,
                        jobCd: GMO.utils.util.JobCd.Sales,
                        amount: entryTranArgs.amount
                    });

                    // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
                    // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
                    // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
                }
            } catch (error) {
                // actionにエラー結果を追加
                try {
                    const actionError = { ...error, ...{ message: error.message, name: error.name } };
                    await repos.action.giveUp(payActionAttributes.typeOf, action.id, actionError);
                } catch (__) {
                    // 失敗したら仕方ない
                }

                throw error;
            }

            // アクション完了
            debug('ending action...');
            const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.CreditCard> = {
                creditCardSales: alterTranResult
            };
            await repos.action.complete(payActionAttributes.typeOf, action.id, actionResult);
        }
    };
}

/**
 * クレジットカードオーソリ取消
 * @param transactionId 取引ID
 */
export function cancelCreditCardAuth(transactionId: string) {
    return async (repos: { action: ActionRepo }) => {
        // クレジットカード仮売上アクションを取得
        const authorizeActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
            await repos.action.findAuthorizeByTransactionId(transactionId)
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard)
                    .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                );

        await Promise.all(authorizeActions.map(async (action) => {
            const entryTranArgs = (<factory.action.authorize.paymentMethod.creditCard.IResult>action.result).entryTranArgs;
            const execTranArgs = (<factory.action.authorize.paymentMethod.creditCard.IResult>action.result).execTranArgs;

            debug('calling alterTran...');
            await GMO.services.credit.alterTran({
                shopId: entryTranArgs.shopId,
                shopPass: entryTranArgs.shopPass,
                accessId: execTranArgs.accessId,
                accessPass: execTranArgs.accessPass,
                jobCd: GMO.utils.util.JobCd.Void,
                amount: entryTranArgs.amount
            });
        }));

        // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
        // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
        // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
    };
}

/**
 * 注文返品取引からクレジットカード返金処理を実行する
 * @param transactionId 注文返品取引ID
 */
export function refundCreditCard(transactionId: string) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
    }) => {
        const transaction = await repos.transaction.findById(factory.transactionType.ReturnOrder, transactionId);
        const potentialActions = transaction.potentialActions;
        const placeOrderTransaction = transaction.object.transaction;
        const placeOrderTransactionResult = placeOrderTransaction.result;
        const authorizeActions = placeOrderTransaction.object.authorizeActions
            .filter((action) => action.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((action) => action.object.typeOf === factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard);

        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('transaction.potentialActions');
        }

        if (placeOrderTransactionResult === undefined) {
            throw new factory.errors.NotFound('placeOrderTransaction.result');
        }
        const returnOrderPotentialActions = potentialActions.returnOrder.potentialActions;
        if (returnOrderPotentialActions === undefined) {
            throw new factory.errors.NotFound('returnOrder.potentialActions');
        }

        await Promise.all(authorizeActions.map(async (authorizeAction) => {
            // アクション開始
            const refundActionAttributes = returnOrderPotentialActions.refundCreditCard;
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (refundActionAttributes === undefined) {
                throw new factory.errors.NotFound('returnOrder.potentialActions.refundCreditCard');
            }
            const action = await repos.action.start(refundActionAttributes);

            let alterTranResult: GMO.services.credit.IAlterTranResult;
            try {
                // 取引状態参照
                const gmoTrade = await GMO.services.credit.searchTrade({
                    shopId: authorizeAction.result.entryTranArgs.shopId,
                    shopPass: authorizeAction.result.entryTranArgs.shopPass,
                    orderId: authorizeAction.result.entryTranArgs.orderId
                });
                debug('gmoTrade is', gmoTrade);

                // 実売上状態であれば取消
                // 手数料がかかるのであれば、ChangeTran、かからないのであれば、AlterTran
                if (gmoTrade.status === GMO.utils.util.Status.Sales) {
                    debug('canceling credit card sales...', authorizeAction);
                    alterTranResult = await GMO.services.credit.alterTran({
                        shopId: authorizeAction.result.entryTranArgs.shopId,
                        shopPass: authorizeAction.result.entryTranArgs.shopPass,
                        accessId: gmoTrade.accessId,
                        accessPass: gmoTrade.accessPass,
                        jobCd: GMO.utils.util.JobCd.Void
                    });
                    debug('GMO alterTranResult is', alterTranResult);
                } else {
                    alterTranResult = {
                        accessId: gmoTrade.accessId,
                        accessPass: gmoTrade.accessPass,
                        forward: gmoTrade.forward,
                        approve: gmoTrade.approve,
                        tranId: gmoTrade.tranId,
                        tranDate: ''
                    };
                }
            } catch (error) {
                // actionにエラー結果を追加
                try {
                    const actionError = { ...error, ...{ message: error.message, name: error.name } };
                    await repos.action.giveUp(action.typeOf, action.id, actionError);
                } catch (__) {
                    // 失敗したら仕方ない
                }

                throw error;
            }

            // アクション完了
            debug('ending action...');
            await repos.action.complete(action.typeOf, action.id, { alterTranResult });

            // 潜在アクション
            await onRefund(refundActionAttributes)({ task: repos.task });
        }));
    };
}

/**
 * 返金後のアクション
 * @param refundActionAttributes 返金アクション属性
 */
function onRefund(refundActionAttributes: factory.action.trade.refund.IAttributes<factory.paymentMethodType>) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes[] = [];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendEmailMessage !== undefined) {
                const sendEmailMessageTask: factory.task.sendEmailMessage.IAttributes = {
                    name: factory.taskName.SendEmailMessage,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 3,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        actionAttributes: potentialActions.sendEmailMessage
                    }
                };
                taskAttributes.push(sendEmailMessageTask);
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
