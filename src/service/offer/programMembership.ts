/**
 * 会員プログラムオファーサービス
 */
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProgramMembershipRepo } from '../../repo/programMembership';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as factory from '../../factory';

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    programMembership: ProgramMembershipRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function authorize(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.offer.programMembership.IObject;
    purpose: factory.action.authorize.offer.programMembership.IPurpose;
}): ICreateOperation<factory.action.authorize.offer.programMembership.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        programMembership: ProgramMembershipRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const seller = transaction.seller;

        // 会員プログラム検索
        const programMemberships = await repos.programMembership.search({ id: { $eq: params.object.itemOffered.id } });
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
        const acceptedOffer = programMembership.offers.find((o) => o.identifier === params.object.identifier);
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
        const actionAttributes: factory.action.authorize.offer.programMembership.IAttributes = {
            project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                typeOf: acceptedOffer.typeOf,
                id: acceptedOffer.id,
                identifier: acceptedOffer.identifier,
                price: acceptedOffer.price,
                priceCurrency: acceptedOffer.priceCurrency,
                eligibleDuration: acceptedOffer.eligibleDuration,
                itemOffered: {
                    project: programMembership.project,
                    typeOf: programMembership.typeOf,
                    id: programMembership.id,
                    name: programMembership.name,
                    programName: programMembership.programName,
                    award: programMembership.award,
                    // 会員プログラムのホスト組織
                    hostingOrganization: {
                        project: seller.project,
                        id: seller.id,
                        name: seller.name,
                        typeOf: seller.typeOf
                    },
                    ...{
                        membershipFor: {
                            typeOf: 'MembershipService',
                            id: programMembership.id
                        }
                    }
                },
                seller: {
                    typeOf: seller.typeOf,
                    name: seller.name.ja
                }
            },
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
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw new factory.errors.ServiceUnavailable('Unexepected error occurred.');
        }

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
export function voidTransaction(params: {
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
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
    };
}
