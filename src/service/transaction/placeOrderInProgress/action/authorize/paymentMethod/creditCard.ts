/**
 * クレジットカード決済承認アクションサービス
 */
import * as GMO from '@motionpicture/gmo-service';
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
 * クレジットカードオーソリ取得
 */
export function create(params: factory.action.authorize.paymentMethod.creditCard.IObject & {
    agentId: string;
    transactionId: string;
}): ICreateOperation<factory.action.authorize.paymentMethod.creditCard.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        organization: OrganizationRepo;
        transaction: TransactionRepo;
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

        // GMOショップ情報取得
        const movieTheater = await repos.organization.findById({
            typeOf: factory.organizationType.MovieTheater,
            id: transaction.seller.id
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.creditCard.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: params,
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: transaction // purposeは取引
        };
        const action = await repos.action.start(actionAttributes);

        // GMOオーソリ取得
        let entryTranArgs: GMO.services.credit.IEntryTranArgs;
        let execTranArgs: GMO.services.credit.IExecTranArgs;
        let entryTranResult: GMO.services.credit.IEntryTranResult;
        let execTranResult: GMO.services.credit.IExecTranResult;
        try {
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Credit card payment not accepted.');
            }
            const creditCardPaymentAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.CreditCard>>
                movieTheater.paymentAccepted.find(
                    (a) => a.paymentMethodType === factory.paymentMethodType.CreditCard
                );
            if (creditCardPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Credit card payment not accepted.');
            }
            entryTranArgs = {
                shopId: creditCardPaymentAccepted.gmoInfo.shopId,
                shopPass: creditCardPaymentAccepted.gmoInfo.shopPass,
                orderId: params.orderId,
                jobCd: GMO.utils.util.JobCd.Auth,
                amount: params.amount
            };
            entryTranResult = await GMO.services.credit.entryTran(entryTranArgs);
            debug('entryTranResult:', entryTranResult);

            execTranArgs = {
                accessId: entryTranResult.accessId,
                accessPass: entryTranResult.accessPass,
                orderId: params.orderId,
                method: params.method,
                siteId: <string>process.env.GMO_SITE_ID,
                sitePass: <string>process.env.GMO_SITE_PASS,
                cardNo: (<factory.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw>params.creditCard).cardNo,
                cardPass: (<factory.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw>params.creditCard).cardPass,
                expire: (<factory.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw>params.creditCard).expire,
                token: (<factory.paymentMethod.paymentCard.creditCard.IUncheckedCardTokenized>params.creditCard).token,
                memberId: (<factory.paymentMethod.paymentCard.creditCard.IUnauthorizedCardOfMember>params.creditCard).memberId,
                cardSeq: (<factory.paymentMethod.paymentCard.creditCard.IUnauthorizedCardOfMember>params.creditCard).cardSeq,
                seqMode: GMO.utils.util.SeqMode.Physics
            };
            execTranResult = await GMO.services.credit.execTran(execTranArgs);
            debug('execTranResult:', execTranResult);
        } catch (error) {
            debug(error);
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            if (error.name === 'GMOServiceBadRequestError') {
                // consider E92000001,E92000002
                // GMO流量制限オーバーエラーの場合
                const serviceUnavailableError = error.errors.find((gmoError: any) => gmoError.info.match(/^E92000001|E92000002$/));
                if (serviceUnavailableError !== undefined) {
                    throw new factory.errors.RateLimitExceeded(serviceUnavailableError.userMessage);
                }

                // オーダーID重複エラーの場合
                const duplicateError = error.errors.find((gmoError: any) => gmoError.info.match(/^E01040010$/));
                if (duplicateError !== undefined) {
                    throw new factory.errors.AlreadyInUse('action.object', ['orderId'], duplicateError.userMessage);
                }

                // その他のGMOエラーに場合、なんらかのクライアントエラー
                throw new factory.errors.Argument('payment');
            }

            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');

        const result: factory.action.authorize.paymentMethod.creditCard.IResult = {
            amount: params.amount,
            paymentMethod: factory.paymentMethodType.CreditCard,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: params.orderId,
            name: 'クレジットカード',
            additionalProperty: params.additionalProperty,
            entryTranArgs: entryTranArgs,
            execTranArgs: execTranArgs,
            execTranResult: execTranResult
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}
export function cancel(params: {
    agentId: string;
    transactionId: string;
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        const actionResult = <factory.action.authorize.paymentMethod.creditCard.IResult>action.result;

        // オーソリ取消
        // 現時点では、ここで失敗したらオーソリ取消をあきらめる
        // GMO混雑エラーはここでも発生する(取消処理でも混雑エラーが発生することは確認済)
        try {
            await GMO.services.credit.alterTran({
                shopId: actionResult.entryTranArgs.shopId,
                shopPass: actionResult.entryTranArgs.shopPass,
                accessId: actionResult.execTranArgs.accessId,
                accessPass: actionResult.execTranArgs.accessPass,
                jobCd: GMO.utils.util.JobCd.Void
            });
            debug('alterTran processed', GMO.utils.util.JobCd.Void);
        } catch (error) {
            // no op
        }
    };
}
