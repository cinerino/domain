/**
 * 予約サービス
 */
import * as createDebug from 'debug';

import * as chevre from '../chevre';
import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';

const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 予約を確定する
 */
export function confirmReservation(params: factory.action.interact.confirm.reservation.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        // アクション開始
        const confirmActionAttributes = params;
        const action = await repos.action.start(confirmActionAttributes);

        try {
            // 座席予約確定
            await repos.reserveService.confirm(confirmActionAttributes.object);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: confirmActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const result: factory.action.interact.confirm.reservation.IResult = {
        };
        await repos.action.complete({ typeOf: confirmActionAttributes.typeOf, id: action.id, result: result });
    };
}
