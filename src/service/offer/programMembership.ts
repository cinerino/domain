/**
 * メンバーシップオファーサービス
 */
import * as moment from 'moment';

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

        // プロダクト検索
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
        // 何かしらメンバーシップへの登録に制約を設けたい場合は、ここに処理を追加するとよいかと思われます。
        // まず取引番号発行
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const publishResult = await transactionNumberService.publish({
            project: { id: project.id }
        });
        const transactionNumber = publishResult.transactionNumber;

        const issuedBy: factory.chevre.organization.IOrganization = {
            project: { typeOf: 'Project', id: project.id },
            id: seller.id,
            name: seller.name,
            typeOf: seller.typeOf
        };

        const programMembership: factory.programMembership.IProgramMembership = {
            project: { typeOf: factory.organizationType.Project, id: membershipService.project.id },
            typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership,
            identifier: transactionNumber,
            name: <any>membershipService.name,
            // programName: <any>membershipService.name,
            hostingOrganization: {
                project: issuedBy.project,
                id: issuedBy.id,
                typeOf: issuedBy.typeOf
            },
            membershipFor: {
                typeOf: 'MembershipService',
                id: <string>membershipService.id
            }
        };

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
                itemOffered: programMembership,
                seller: {
                    typeOf: seller.typeOf,
                    name: (typeof seller.name === 'string')
                        ? seller.name
                        : String(seller.name?.ja)
                },
                ...{
                    pendingTransaction: <any>{
                        transactionNumber: transactionNumber
                    }
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
            // Chevreでサービス登録取引
            const registerServiceTransaction = new chevre.service.transaction.RegisterService({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            await registerServiceTransaction.start({
                project: { typeOf: 'Project', id: project.id },
                typeOf: factory.chevre.transactionType.RegisterService,
                transactionNumber: transactionNumber,
                object: [
                    {
                        typeOf: factory.chevre.offerType.Offer,
                        id: <string>acceptedOffer.id,
                        itemOffered: {
                            project: { typeOf: <'Project'>'Project', id: project.id },
                            typeOf: membershipService.typeOf,
                            id: membershipService.id,
                            serviceOutput: {
                                project: { typeOf: <'Project'>'Project', id: project.id },
                                typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership,
                                issuedBy: issuedBy,
                                name: programMembership.name
                                // additionalProperty: [{ name: 'sampleName', value: 'sampleValue' }],
                            }
                        }
                    }
                ],
                agent: {
                    typeOf: transaction.agent.typeOf,
                    name: transaction.agent.id,
                    ...{
                        identifier: [
                            { name: 'transaction', value: transaction.id },
                            {
                                name: 'transactionExpires',
                                value: moment(transaction.expires)
                                    .toISOString()
                            }
                        ]
                    }
                },
                expires: moment(transaction.expires)
                    .add(1, 'day') // 余裕を持って
                    .toDate()
            });
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
