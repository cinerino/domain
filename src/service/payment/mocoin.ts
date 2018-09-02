/**
 * Mocoin決済サービス
 */
import * as factory from '@cinerino/factory';
import * as mocoinapi from '@mocoin/api-nodejs-client';
import * as createDebug from 'debug';
// import * as moment from 'moment';

import { MongoRepository as ActionRepo } from '../../repo/action';
// import { MongoRepository as TaskRepo } from '../../repo/task';

const debug = createDebug('cinerino-domain:service');

/**
 * Mocoin支払実行
 */
export function payMocoin(params: factory.task.payMocoin.IData) {
    return async (repos: {
        action: ActionRepo;
        mocoinAuthClient: mocoinapi.auth.ClientCredentials;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const mocoinTransaction = params.object.mocoinTransaction;
            // 転送取引の場合確定
            const transferService = new mocoinapi.service.transaction.TransferCoin({
                endpoint: params.object.mocoinEndpoint,
                auth: repos.mocoinAuthClient
            });
            await transferService.confirm(mocoinTransaction);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.Mocoin> = {};
        await repos.action.complete(action.typeOf, action.id, actionResult);
    };
}
