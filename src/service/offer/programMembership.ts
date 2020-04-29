/**
 * 会員プログラムオファーサービス
 */
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
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
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

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

        const membershipServiceId = params.object.itemOffered.membershipFor?.id;
        if (typeof membershipServiceId !== 'string') {
            throw new factory.errors.ArgumentNull('object.itemOffered.membershipFor.id');
        }

        // 会員プログラム検索
        const membershipService = await productService.findById({ id: membershipServiceId });
        const offers = await productService.searchOffers({ id: String(membershipService.id) });
        const acceptedOffer = offers.find((o) => o.identifier === params.object.identifier);
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        // 金額計算
        if (acceptedOffer.priceSpecification.typeOf !== factory.chevre.priceSpecificationType.CompoundPriceSpecification) {
            throw new factory.errors.ServiceUnavailable('price specification of result accepted offer must be CompoundPriceSpecification');
        }
        const priceSpecification = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>acceptedOffer.priceSpecification;
        const amount = priceSpecification.priceComponent.reduce((a2, b2) => a2 + Number(b2.price), 0);

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
                // price: amount,
                priceCurrency: acceptedOffer.priceCurrency,
                priceSpecification: acceptedOffer.priceSpecification,
                itemOffered: {
                    project: { typeOf: factory.organizationType.Project, id: membershipService.project.id },
                    typeOf: factory.programMembership.ProgramMembershipType.ProgramMembership,
                    name: <any>membershipService.name,
                    programName: <any>membershipService.name,
                    // 会員プログラムのホスト組織
                    hostingOrganization: {
                        project: seller.project,
                        id: seller.id,
                        name: seller.name,
                        typeOf: seller.typeOf
                    },
                    membershipFor: {
                        typeOf: 'MembershipService',
                        id: <string>membershipService.id
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
            price: amount,
            priceCurrency: <factory.chevre.priceCurrency>acceptedOffer.priceSpecification?.priceCurrency
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
