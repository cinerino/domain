/**
 * ヘルスチェックサービス
 * 実験的実装中
 */
import * as factory from '@cinerino/factory';
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as GMONotificationRepo } from '../../repo/gmoNotification';

export type GMONotificationOperation<T> = (gmoNotificationRepository: GMONotificationRepo) => Promise<T>;
export type IGMOResultNotification = GMO.factory.resultNotification.creditCard.IResultNotification;

const debug = createDebug('cinerino-domain:service');

/**
 * GMO売上健康診断レポートインターフェース
 */
export interface IReportOfGMOSalesHealthCheck {
    madeFrom: Date;
    madeThrough: Date;
    numberOfSales: number;
    totalAmount: number;
    totalAmountCurrency: factory.priceCurrency;
    unhealthGMOSales: IUnhealthGMOSale[];
}

/**
 * 不健康なGMO売上インターフェース
 */
export interface IUnhealthGMOSale {
    orderId: string;
    amount: number;
    reason: string;
}

/**
 * 期間指定でGMO実売上の健康診断を実施する
 */
export function checkGMOSales(madeFrom: Date, madeThrough: Date) {
    return async (repos: {
        gmoNotification: GMONotificationRepo;
        action: ActionRepo;
    }): Promise<IReportOfGMOSalesHealthCheck> => {
        const sales = await repos.gmoNotification.searchSales({
            tranDateFrom: madeFrom,
            tranDateThrough: madeThrough
        });
        debug(sales.length, 'sales found.');

        const totalAmount = sales.reduce((a, b) => a + b.amount, 0);

        // オーダーIDごとに有効性確認すると、コマンド過多でMongoDBにある程度の負荷をかけてしまう
        // まとめて検索してから、ローカルで有効性を確認する必要がある
        const orderIds = sales.map((sale) => sale.orderId);

        // オーダーIDでPayActionを検索
        const payActions = await repos.action.actionModel.find({
            typeOf: factory.actionType.PayAction,
            actionStatus: factory.actionStatusType.CompletedActionStatus,
            'object.paymentMethod.paymentMethodId': { $in: orderIds }
        }).exec().then((docs) => docs.map((doc) => <factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>>doc.toObject()));
        debug(payActions.length, 'payActions found.');

        const errors: IUnhealthGMOSale[] = [];
        sales.forEach((gmoSale) => {
            try {
                // オーダーIDに該当する取引がなければエラー
                const payActionByOrderId = payActions.find((payAction) => {
                    return payAction.object.paymentMethod.paymentMethodId === gmoSale.orderId;
                });
                if (payActionByOrderId === undefined) {
                    throw new factory.errors.NotFound('PayAction by orderId');
                }

                // アクセスIDが一致するかどうか
                const payActionResult = payActionByOrderId.result;
                if (payActionResult === undefined) {
                    throw new factory.errors.NotFound('payAction.result');
                }
                if (payActionResult.creditCardSales === undefined) {
                    throw new factory.errors.NotFound('payAction.result.creditCardSales');
                }
                if (payActionResult.creditCardSales.accessId !== gmoSale.accessId) {
                    throw new Error('accessId not matched');
                }
                if (payActionResult.creditCardSales.approve !== gmoSale.approve) {
                    throw new Error('approve not matched');
                }

                // 金額が同一かどうか
                if (payActionByOrderId.object.price !== gmoSale.amount) {
                    throw new Error('amount not matched');
                }
            } catch (error) {
                errors.push({
                    orderId: gmoSale.orderId,
                    amount: gmoSale.amount,
                    reason: error.message
                });
            }
        });

        return {
            madeFrom: madeFrom,
            madeThrough: madeThrough,
            numberOfSales: sales.length,
            totalAmount: totalAmount,
            totalAmountCurrency: factory.priceCurrency.JPY,
            unhealthGMOSales: errors
        };
    };
}
