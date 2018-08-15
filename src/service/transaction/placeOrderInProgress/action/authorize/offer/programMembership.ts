/**
 * 会員プログラムオファー承認アクションサービス
 */
import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OrganizationRepo } from '../../../../../../repo/organization';
import { MongoRepository as ProgramMembershipRepo } from '../../../../../../repo/programMembership';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:*');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    organization: OrganizationRepo;
    programMembership: ProgramMembershipRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function create(params: {
    agentId: string;
    transactionId: string;
    /**
     * 受け入れられた会員プログラムオファー
     */
    acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>;
}): ICreateOperation<factory.action.authorize.offer.programMembership.IAction> {
    return async (repos: {
        action: ActionRepo;
        organization: OrganizationRepo;
        programMembership: ProgramMembershipRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 会員プログラム検索
        const programMemberships = await repos.programMembership.search({ id: params.acceptedOffer.itemOffered.id });
        const programMembership = programMemberships.shift();
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership === undefined) {
            throw new factory.errors.NotFound('ProgramMembership');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership.offers === undefined) {
            throw new factory.errors.NotFound('ProgramMembership.Offer');
        }
        const acceptedOffer = programMembership.offers.find((o) => o.identifier === params.acceptedOffer.identifier);
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        // 在庫確認は現時点で不要
        // 何かしら会員プログラムへの登録に制約を設けたい場合は、ここに処理を追加するとよいかと思われます。

        // 承認アクションを開始
        debug('starting authorize action of programMembership...');
        const actionAttributes: factory.action.authorize.offer.programMembership.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: params.acceptedOffer,
            agent: transaction.seller,
            recipient: transaction.agent,
            purpose: transaction
        };
        const action = await repos.action.start(actionAttributes);

        try {
            // 在庫確保？
        } catch (error) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next: ありえないフロー */
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next: ありえないフロー */
            throw new factory.errors.ServiceUnavailable('Unexepected error occurred.');
        }

        // アクションを完了
        debug('ending authorize action...');
        const result: factory.action.authorize.offer.programMembership.IResult = {
            price: acceptedOffer.price,
            priceCurrency: acceptedOffer.priceCurrency
        };

        return repos.action.complete(action.typeOf, action.id, result);
    };
}

/**
 * 承認アクションをキャンセルする
 * @param agentId アクション主体ID
 * @param transactionId 取引ID
 * @param actionId アクションID
 */
export function cancel(params: {
    agentId: string;
    transactionId: string;
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const action = await repos.action.cancel(factory.actionType.AuthorizeAction, params.actionId);
        debug('action canceld.', action.id);
    };
}
