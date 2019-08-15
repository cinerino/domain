/**
 * 汎用決済承認アクションサービス
 */
import * as createDebug from 'debug';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 承認アクション
 */
export function authorize<T extends factory.paymentMethodType>(params: {
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.any.IObject<T>;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.any.IAction<T>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // 販売者情報取得
        const seller = await repos.seller.findById({
            id: transaction.seller.id
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: params.object,
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        try {
            if (seller.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', `${params.object.typeOf} payment not accepted`);
            }
            const paymentAccepted = <factory.seller.IPaymentAccepted<T>>
                seller.paymentAccepted.find((a) => a.paymentMethodType === params.object.typeOf);
            if (paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', `${params.object.typeOf} payment not accepted`);
            }
        } catch (error) {
            debug(error);
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const result: factory.action.authorize.paymentMethod.any.IResult<T> = {
            accountId: '',
            amount: params.object.amount,
            paymentMethod: params.object.typeOf,
            paymentStatus: factory.paymentStatusType.PaymentComplete,
            paymentMethodId: '',
            name: (typeof params.object.name === 'string') ? params.object.name : String(params.object.typeOf),
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : []
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function voidTransaction(params: {
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>action.result;
        debug('actionResult:', actionResult);

        // 承認取消
        try {
            // some op
        } catch (error) {
            // no op
        }
    };
}
