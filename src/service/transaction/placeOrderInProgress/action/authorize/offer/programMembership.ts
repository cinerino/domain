/**
 * 会員プログラムオファー承認アクションサービス
 */
import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as ProgramMembershipRepo } from '../../../../../../repo/programMembership';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import * as factory from '../../../../../../factory';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
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
        programMembership: ProgramMembershipRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

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
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (acceptedOffer.price === undefined) {
            throw new factory.errors.NotFound('Offer Price undefined');
        }

        // 在庫確認は現時点で不要
        // 何かしら会員プログラムへの登録に制約を設けたい場合は、ここに処理を追加するとよいかと思われます。

        // 承認アクションを開始
        debug('starting authorize action of programMembership...');
        const actionAttributes: factory.action.authorize.offer.programMembership.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: params.acceptedOffer,
            agent: transaction.seller,
            recipient: transaction.agent,
            purpose: {
                typeOf: transaction.typeOf,
                id: transaction.id
            }
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
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
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

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 承認アクションをキャンセルする
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
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        debug('action canceld.', action.id);
    };
}
