/**
 * 汎用決済承認アクションサービス
 */
import * as createDebug from 'debug';

import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OrganizationRepo } from '../../../../../../repo/organization';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    organization: OrganizationRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
/**
 * 承認アクション
 */
export function create<T extends factory.paymentMethodType>(params: {
    object: factory.action.authorize.paymentMethod.any.IObject<T>;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.paymentMethod.any.IAction<T>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        organization: OrganizationRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // ショップ情報取得
        const movieTheater = await repos.organization.findById({
            typeOf: factory.organizationType.MovieTheater,
            id: transaction.seller.id
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.any.IAttributes<T> = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: params.object.typeOf,
                amount: params.object.amount,
                additionalProperty: params.object.additionalProperty
            },
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        try {
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transaction', `${params.object.typeOf} payment not accepted`);
            }
            const paymentAccepted = <factory.organization.IPaymentAccepted<T>>
                movieTheater.paymentAccepted.find((a) => a.paymentMethodType === params.object.typeOf);
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
            name: params.object.typeOf,
            additionalProperty: params.object.additionalProperty
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}
export function cancel(params: {
    /**
     * 承認アクションID
     */
    id: string;
    /**
     * 取引進行者
     */
    agent: { id: string };
    /**
     * 取引
     */
    transaction: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
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
