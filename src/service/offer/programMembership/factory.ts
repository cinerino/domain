/**
 * メンバーシップオファーファクトリー
 */
import * as moment from 'moment';

import * as factory from '../../../factory';

export function createActionAttributes(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    acceptedOffer: factory.chevre.event.screeningEvent.ITicketOffer;
    product: factory.chevre.service.IService;
    transactionNumber: string;
}): factory.action.authorize.offer.programMembership.IAttributes {
    const acceptedOffer = params.acceptedOffer;
    const seller = params.transaction.seller;
    const transaction = params.transaction;

    const issuedBy: factory.chevre.organization.IOrganization = {
        project: { typeOf: 'Project', id: params.project.id },
        id: seller.id,
        name: seller.name,
        typeOf: seller.typeOf
    };

    const programMembership: factory.programMembership.IProgramMembership = {
        project: { typeOf: factory.organizationType.Project, id: params.project.id },
        typeOf: <any>params.product.serviceOutput?.typeOf,
        identifier: params.transactionNumber,
        name: <any>params.product.name,
        hostingOrganization: {
            project: issuedBy.project,
            id: issuedBy.id,
            typeOf: issuedBy.typeOf
        },
        membershipFor: {
            typeOf: params.product.typeOf,
            id: <string>params.product.id
        },
        ...{
            issuedThrough: {
                typeOf: params.product.typeOf,
                id: <string>params.product.id
            }
        }
    };

    // 承認アクションを開始
    return {
        project: { typeOf: factory.organizationType.Project, id: params.project.id },
        typeOf: factory.actionType.AuthorizeAction,
        object: {
            project: { typeOf: factory.organizationType.Project, id: params.project.id },
            typeOf: acceptedOffer.typeOf,
            id: acceptedOffer.id,
            identifier: acceptedOffer.identifier,
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
                    transactionNumber: params.transactionNumber
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
}

export function createRegisterServiceStartParams(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    acceptedOffer: factory.chevre.event.screeningEvent.ITicketOffer;
    product: factory.chevre.service.IService;
    transactionNumber: string;
    pointAward?: factory.chevre.service.IPointAward;
}): factory.chevre.transaction.registerService.IStartParamsWithoutDetail {
    const acceptedOffer = params.acceptedOffer;
    const seller = params.transaction.seller;
    const transaction = params.transaction;

    const issuedBy: factory.chevre.organization.IOrganization = {
        project: { typeOf: 'Project', id: params.project.id },
        id: seller.id,
        name: seller.name,
        typeOf: seller.typeOf
    };

    return {
        project: { typeOf: 'Project', id: params.project.id },
        typeOf: factory.chevre.transactionType.RegisterService,
        transactionNumber: params.transactionNumber,
        object: [
            {
                typeOf: factory.chevre.offerType.Offer,
                id: <string>acceptedOffer.id,
                itemOffered: {
                    project: { typeOf: <'Project'>'Project', id: params.project.id },
                    typeOf: params.product.typeOf,
                    id: params.product.id,
                    serviceOutput: {
                        project: { typeOf: <'Project'>'Project', id: params.project.id },
                        typeOf: String(params.product.serviceOutput?.typeOf),
                        issuedBy: issuedBy,
                        name: params.product.name
                        // additionalProperty: [{ name: 'sampleName', value: 'sampleValue' }],
                    },
                    ...(params.pointAward !== undefined) ? { pointAward: params.pointAward } : undefined
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
    };
}
