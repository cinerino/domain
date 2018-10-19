/**
 * Mocoin決済承認アクションサービス
 */
import * as mocoinapi from '@mocoin/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OrganizationRepo } from '../../../../../../repo/organization';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import { handlePecorinoError } from '../../../../../../errorHandler';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    organization: OrganizationRepo;
    transaction: TransactionRepo;
    transferService: mocoinapi.service.transaction.TransferCoin;
}) => Promise<T>;

/**
 * Pecorino残高差し押さえ
 * 口座取引は、出金取引あるいは転送取引のどちらかを選択できます。
 */
export function create(params: factory.action.authorize.paymentMethod.mocoin.IObject & {
    agentId: string;
    transactionId: string;
}): ICreateOperation<factory.action.authorize.paymentMethod.mocoin.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        organization: OrganizationRepo;
        transaction: TransactionRepo;
        transferService: mocoinapi.service.transaction.TransferCoin;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // インセンティブ付与可能条件は、会員プログラム特典に加入しているかどうか
        if (transaction.agent.memberOf === undefined) {
            throw new factory.errors.Forbidden('Membership required');
        }

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.mocoin.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: params,
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: transaction
        };
        const action = await repos.action.start(actionAttributes);

        let mocoinEndpoint: string;
        // Mocoinオーソリ取得
        type IMocoinTransaction = mocoinapi.factory.transaction.ITokenizedTransaction;
        let mocoinTransaction: IMocoinTransaction;

        try {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            mocoinEndpoint = repos.transferService.options.endpoint;

            // 組織から転送先口座IDを取得する
            const seller = await repos.organization.findById({
                typeOf: transaction.seller.typeOf,
                id: transaction.seller.id
            });
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (seller.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Pecorino payment not accepted.');
            }
            const mocoinPaymentAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.Mocoin>>
                seller.paymentAccepted.find(
                    (a) => a.paymentMethodType === factory.paymentMethodType.Mocoin
                );
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (mocoinPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Mocoin payment not accepted.');
            }

            debug('starting pecorino pay transaction...', params.amount);
            mocoinTransaction = await repos.transferService.start({
                // 最大1ヵ月のオーソリ
                expires: moment().add(1, 'month').toDate(),
                agent: {
                    typeOf: transaction.agent.typeOf,
                    id: transaction.agent.id,
                    name: `placeOrderTransaction-${transaction.id}`,
                    url: transaction.agent.url
                },
                recipient: {
                    typeOf: transaction.seller.typeOf,
                    id: transaction.seller.id,
                    name: transaction.seller.name.ja,
                    url: transaction.seller.url
                },
                amount: params.amount,
                // tslint:disable-next-line:no-single-line-block-comment
                notes: (params.notes !== undefined) ? /* istanbul ignore next */ params.notes : 'Cinerino 注文取引',
                fromLocation: {
                    typeOf: mocoinapi.factory.ownershipInfo.AccountGoodType.Account,
                    accountType: mocoinapi.factory.accountType.Coin,
                    accountNumber: params.fromAccountNumber
                },
                toLocation: {
                    typeOf: mocoinapi.factory.ownershipInfo.AccountGoodType.Account,
                    accountType: mocoinapi.factory.accountType.Coin,
                    accountNumber: mocoinPaymentAccepted.accountNumber
                }
            });
            debug('mocoinTransaction started.', mocoinTransaction.token);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, name: error.name, message: error.message };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            // PecorinoAPIのエラーｗｐハンドリング
            error = handlePecorinoError(error);
            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const actionResult: factory.action.authorize.paymentMethod.mocoin.IResult = {
            amount: params.amount,
            additionalProperty: params.additionalProperty,
            mocoinTransaction: mocoinTransaction,
            mocoinEndpoint: mocoinEndpoint
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
/**
 * Pecorino承認を取り消す
 */
export function cancel(params: {
    /**
     * 取引進行者ID
     */
    agentId: string;
    /**
     * 取引ID
     */
    transactionId: string;
    /**
     * 承認アクションID
     */
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        transferService: mocoinapi.service.transaction.TransferCoin;
    }) => {
        debug('canceling pecorino authorize action...');
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // まずアクションをキャンセル
        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        const actionResult = <factory.action.authorize.paymentMethod.mocoin.IResult>action.result;

        // Pecorinoで取消中止実行
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        await repos.transferService.cancel(actionResult.mocoinTransaction);
    };
}
