/**
 * クレジットカード決済サービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as TaskRepo } from '../../repo/task';

const debug = createDebug('cinerino-domain:service');

/**
 * クレジットカード売上確定
 */
export function payCreditCard(params: factory.task.IData<factory.taskName.PayCreditCard>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);
        const alterTranResults: GMO.services.credit.IAlterTranResult[] = [];

        try {
            await Promise.all(params.object.map(async (paymentMethod) => {
                const entryTranArgs = paymentMethod.entryTranArgs;
                const execTranArgs = paymentMethod.execTranArgs;

                // 取引状態参照
                const searchTradeResult = await GMO.services.credit.searchTrade({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    orderId: entryTranArgs.orderId
                });

                if (searchTradeResult.jobCd === GMO.utils.util.JobCd.Sales) {
                    debug('already in SALES');
                    // すでに実売上済み
                    alterTranResults.push({
                        accessId: searchTradeResult.accessId,
                        accessPass: searchTradeResult.accessPass,
                        forward: searchTradeResult.forward,
                        approve: searchTradeResult.approve,
                        tranId: searchTradeResult.tranId,
                        tranDate: ''
                    });
                } else {
                    debug('calling alterTran...');
                    alterTranResults.push(await GMO.services.credit.alterTran({
                        shopId: entryTranArgs.shopId,
                        shopPass: entryTranArgs.shopPass,
                        accessId: execTranArgs.accessId,
                        accessPass: execTranArgs.accessPass,
                        jobCd: GMO.utils.util.JobCd.Sales,
                        amount: entryTranArgs.amount
                    }));

                    // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
                    // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
                    // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
                }

                await repos.invoice.changePaymentStatus({
                    referencesOrder: { orderNumber: params.purpose.orderNumber },
                    paymentMethod: paymentMethod.paymentMethod.typeOf,
                    paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                    paymentStatus: factory.paymentStatusType.PaymentComplete
                });
            }));
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

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.CreditCard> = {
            creditCardSales: alterTranResults
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * クレジットカードオーソリ取消
 */
export function cancelCreditCardAuth(params: { transactionId: string }) {
    return async (repos: { action: ActionRepo }) => {
        // クレジットカード仮売上アクションを取得
        const authorizeActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
            await repos.action.findAuthorizeByTransactionId(params)
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.paymentMethodType.CreditCard)
                    .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                );
        await Promise.all(authorizeActions.map(async (action) => {
            if (action.result !== undefined) {
                debug('calling alterTran...');
                await GMO.services.credit.alterTran({
                    shopId: action.result.entryTranArgs.shopId,
                    shopPass: action.result.entryTranArgs.shopPass,
                    accessId: action.result.execTranArgs.accessId,
                    accessPass: action.result.execTranArgs.accessPass,
                    jobCd: GMO.utils.util.JobCd.Void,
                    amount: action.result.entryTranArgs.amount
                });
                await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
            }
        }));

        // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
        // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
        // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
    };
}

/**
 * クレジットカード返金処理を実行する
 */
export function refundCreditCard(params: factory.task.IData<factory.taskName.RefundCreditCard>) {
    return async (repos: {
        action: ActionRepo;
        task: TaskRepo;
    }) => {
        const refundActionAttributes = params;
        const action = await repos.action.start(refundActionAttributes);
        const alterTranResult: GMO.services.credit.IAlterTranResult[] = [];

        try {
            const payAction = refundActionAttributes.object;
            await Promise.all(payAction.object.map(async (paymentMethod) => {
                const entryTranArgs = paymentMethod.entryTranArgs;
                // const execTranArgs = paymentMethod.execTranArgs;
                // 取引状態参照
                const gmoTrade = await GMO.services.credit.searchTrade({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    orderId: entryTranArgs.orderId
                });
                debug('gmoTrade is', gmoTrade);

                // 実売上状態であれば取消
                // 手数料がかかるのであれば、ChangeTran、かからないのであれば、AlterTran
                if (gmoTrade.status === GMO.utils.util.Status.Sales) {
                    alterTranResult.push(await GMO.services.credit.alterTran({
                        shopId: entryTranArgs.shopId,
                        shopPass: entryTranArgs.shopPass,
                        accessId: gmoTrade.accessId,
                        accessPass: gmoTrade.accessPass,
                        jobCd: GMO.utils.util.JobCd.Void
                    }));
                    debug('GMO alterTranResult is', alterTranResult);
                } else {
                    alterTranResult.push({
                        accessId: gmoTrade.accessId,
                        accessPass: gmoTrade.accessPass,
                        forward: gmoTrade.forward,
                        approve: gmoTrade.approve,
                        tranId: gmoTrade.tranId,
                        tranDate: ''
                    });
                }
            }));
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

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: { alterTranResult } });

        // 潜在アクション
        await onRefund(refundActionAttributes)({ task: repos.task });
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
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendEmailMessage !== undefined) {
                const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
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
