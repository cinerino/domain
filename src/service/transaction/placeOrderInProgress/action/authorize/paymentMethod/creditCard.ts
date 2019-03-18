/**
 * クレジットカード決済承認アクションサービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';
import * as util from 'util';

import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as SellerRepo } from '../../../../../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export import IUncheckedCardRaw = factory.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw;
export import IUncheckedCardTokenized = factory.paymentMethod.paymentCard.creditCard.IUncheckedCardTokenized;
export import IUnauthorizedCardOfMember = factory.paymentMethod.paymentCard.creditCard.IUnauthorizedCardOfMember;

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * クレジットカードオーソリ取得
 */
export function create(params: {
    project: {
        id: string;
        /**
         * GMO決済情報
         */
        gmoInfo: {
            siteId: string;
            sitePass: string;
        };
    };
    object: factory.action.authorize.paymentMethod.creditCard.IObject;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.paymentMethod.creditCard.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        seller: SellerRepo;
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

        // GMOショップ情報取得
        const movieTheater = await repos.seller.findById({
            id: transaction.seller.id
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.creditCard.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: params.object,
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // GMOオーソリ取得
        let creditCardPaymentAccepted: factory.seller.IPaymentAccepted<factory.paymentMethodType.CreditCard>;
        let orderId: string;
        let entryTranArgs: GMO.services.credit.IEntryTranArgs;
        let entryTranResult: GMO.services.credit.IEntryTranResult;
        let execTranArgs: GMO.services.credit.IExecTranArgs;
        let execTranResult: GMO.services.credit.IExecTranResult;
        let searchTradeResult: GMO.services.credit.ISearchTradeResult | undefined;

        if (movieTheater.paymentAccepted === undefined) {
            throw new factory.errors.Argument('transaction', 'Credit card payment not accepted.');
        }
        creditCardPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.CreditCard>>
            movieTheater.paymentAccepted.find(
                (a) => a.paymentMethodType === factory.paymentMethodType.CreditCard
            );
        if (creditCardPaymentAccepted === undefined) {
            throw new factory.errors.Argument('transaction', 'Credit card payment not accepted.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        if (creditCardPaymentAccepted.gmoInfo.shopPass === undefined) {
            throw new factory.errors.Argument('transaction', 'Credit card payment settings not enough');
        }

        try {
            // GMOオーダーIDはカスタム指定可能
            orderId = (params.object.orderId !== undefined) ? params.object.orderId : generateOrderId(params);

            entryTranArgs = {
                shopId: creditCardPaymentAccepted.gmoInfo.shopId,
                shopPass: creditCardPaymentAccepted.gmoInfo.shopPass,
                orderId: orderId,
                jobCd: GMO.utils.util.JobCd.Auth,
                amount: params.object.amount
            };

            entryTranResult = await GMO.services.credit.entryTran(entryTranArgs);
            debug('entryTranResult:', entryTranResult);

            const creditCard = params.object.creditCard;
            execTranArgs = {
                accessId: entryTranResult.accessId,
                accessPass: entryTranResult.accessPass,
                orderId: orderId,
                method: params.object.method,
                siteId: params.project.gmoInfo.siteId,
                sitePass: params.project.gmoInfo.sitePass,
                cardNo: (<IUncheckedCardRaw>creditCard).cardNo,
                cardPass: (<IUncheckedCardRaw>creditCard).cardPass,
                expire: (<IUncheckedCardRaw>creditCard).expire,
                token: (<IUncheckedCardTokenized>creditCard).token,
                memberId: (<IUnauthorizedCardOfMember>creditCard).memberId,
                cardSeq: (<IUnauthorizedCardOfMember>creditCard).cardSeq,
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

        try {
            // ベストエフォートでクレジットカード詳細情報を取得
            searchTradeResult = await GMO.services.credit.searchTrade({
                shopId: creditCardPaymentAccepted.gmoInfo.shopId,
                shopPass: creditCardPaymentAccepted.gmoInfo.shopPass,
                orderId: orderId
            });
        } catch (error) {
            // no op
        }

        // アクションを完了
        debug('ending authorize action...');

        const result: factory.action.authorize.paymentMethod.creditCard.IResult = {
            accountId: (searchTradeResult !== undefined) ? searchTradeResult.cardNo : '',
            amount: params.object.amount,
            paymentMethod: factory.paymentMethodType.CreditCard,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: orderId,
            name: factory.paymentMethodType.CreditCard,
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            entryTranArgs: entryTranArgs,
            entryTranResult: entryTranResult,
            execTranArgs: execTranArgs,
            execTranResult: execTranResult
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * GMOオーダーIDを生成する
 */
export function generateOrderId(params: {
    project: { id: string };
    transaction: { id: string };
}) {
    // tslint:disable-next-line:no-magic-numbers
    const projectId = `${params.project.id}---`.slice(0, 3);
    const dateTime = moment()
        .tz('Asia/Tokyo')
        .format('YYMMDDhhmmssSSS');
    // tslint:disable-next-line:no-magic-numbers
    const transactionId = params.transaction.id.slice(-6);

    return util.format(
        '%s%s%s',
        projectId, // プロジェクトIDの頭数文字
        dateTime,
        transactionId
    );
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
