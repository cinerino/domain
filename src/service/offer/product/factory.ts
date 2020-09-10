import * as moment from 'moment';

import * as chevre from '../../../chevre';
import * as factory from '../../../factory';

export enum ProductType {
    Account = 'Account',
    PaymentCard = 'PaymentCard',
    PointCard = 'PointCard',
    MembershipService = 'MembershipService'
}

export const availableProductTypes: string[] = [
    ProductType.Account,
    ProductType.PaymentCard,
    ProductType.PointCard,
    ProductType.MembershipService
];

export function createRegisterServiceStartParams(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.product.IObject;
    transaction: factory.transaction.ITransaction<any>;
    transactionNumber: string;
}): factory.chevre.transaction.registerService.IStartParamsWithoutDetail {
    return {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: chevre.factory.transactionType.RegisterService,
        transactionNumber: params.transactionNumber,
        agent: {
            typeOf: params.transaction.agent.typeOf,
            name: params.transaction.agent.id,
            ...{
                identifier: [
                    { name: 'transaction', value: params.transaction.id },
                    {
                        name: 'transactionExpires',
                        value: moment(params.transaction.expires)
                            .toISOString()
                    }
                ]
            }
        },
        object: params.object.map((o) => {
            return {
                typeOf: <factory.chevre.offerType.Offer>o.typeOf,
                id: String(o.id),
                itemOffered: o.itemOffered
            };
        }),
        expires: moment(params.transaction.expires)
            .add(1, 'day')
            .toDate() // 余裕を持って
    };
}

export function createActionAttributes(params: {
    acceptedOffer: factory.action.authorize.offer.product.IObject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    transactionNumber: string;
}): factory.action.authorize.offer.product.IAttributes {
    const transaction = params.transaction;

    return {
        project: transaction.project,
        typeOf: factory.actionType.AuthorizeAction,
        // Chevreサービス登録取引を使用して
        instrument: {
            typeOf: factory.chevre.transactionType.RegisterService,
            transactionNumber: params.transactionNumber
        },
        object: params.acceptedOffer,
        agent: {
            project: transaction.seller.project,
            id: transaction.seller.id,
            typeOf: transaction.seller.typeOf,
            name: transaction.seller.name,
            location: transaction.seller.location,
            telephone: transaction.seller.telephone,
            url: transaction.seller.url,
            image: transaction.seller.image
        },
        recipient: transaction.agent,
        purpose: { typeOf: transaction.typeOf, id: transaction.id }
    };
}

function acceptedOffers2amount(params: {
    acceptedOffers: factory.action.authorize.offer.product.IResultAcceptedOffer;
}): number {
    const acceptedOffers = params.acceptedOffers;

    // 金額計算
    return acceptedOffers.reduce(
        (a, b) => {
            if (b.priceSpecification === undefined || b.priceSpecification === null) {
                throw new factory.errors.ServiceUnavailable('price specification of result accepted offer undefined');
            }

            if (b.priceSpecification.typeOf !== factory.chevre.priceSpecificationType.CompoundPriceSpecification) {
                throw new factory.errors.ServiceUnavailable('price specification of result accepted offer must be CompoundPriceSpecification');
            }

            const priceSpecification = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>b.priceSpecification;

            return a + priceSpecification.priceComponent.reduce((a2, b2) => a2 + Number(b2.price), 0);
        },
        0
    );
}

function responseBody2resultAcceptedOffer(params: {
    project: factory.project.IProject;
    responseBody: factory.chevre.transaction.registerService.ITransaction;
    acceptedOffer: factory.action.authorize.offer.product.IObject;
}): factory.action.authorize.offer.product.IResultAcceptedOffer {
    let acceptedOffers: factory.action.authorize.offer.product.IResultAcceptedOffer = [];

    if (Array.isArray(params.responseBody.object)) {
        acceptedOffers = params.responseBody.object.map((responseBodyObject) => {
            const itemOffered: factory.order.IServiceOutput = {
                ...responseBodyObject.itemOffered?.serviceOutput,
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: String(responseBodyObject.itemOffered?.serviceOutput?.typeOf),
                // masked accessCode
                ...(typeof responseBodyObject.itemOffered?.serviceOutput?.accessCode === 'string') ? { accessCode: 'xxx' } : undefined,
                // メンバーシップの場合、属性保管
                ...(responseBodyObject.itemOffered?.serviceOutput?.issuedThrough?.typeOf
                    === factory.chevre.product.ProductType.MembershipService)
                    ? {
                        membershipFor: responseBodyObject.itemOffered?.serviceOutput?.issuedThrough,
                        hostingOrganization: responseBodyObject.itemOffered?.serviceOutput.issuedBy
                    }
                    : undefined,
                // 口座の場合、属性保管
                ...(responseBodyObject.itemOffered?.serviceOutput?.issuedThrough?.typeOf === factory.chevre.product.ProductType.Account)
                    ? {
                        accountNumber: responseBodyObject.itemOffered?.serviceOutput?.identifier,
                        accountType: responseBodyObject.itemOffered?.serviceOutput?.amount?.currency
                    }
                    : undefined
            };

            const offer = params.acceptedOffer.find((o) => o.id === responseBodyObject.id);
            if (offer === undefined) {
                throw new factory.errors.ServiceUnavailable(`Offer ${responseBodyObject.id} from registerService not found`);
            }

            return {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: responseBodyObject.typeOf,
                id: offer.id,
                name: offer.name,
                itemOffered: itemOffered,
                priceSpecification: offer.priceSpecification,
                priceCurrency: offer.priceCurrency,
                seller: offer.seller
            };
        });
    }

    return acceptedOffers;
}

export function createResult(params: {
    project: factory.project.IProject;
    requestBody: factory.chevre.transaction.registerService.IStartParamsWithoutDetail;
    responseBody: factory.chevre.transaction.registerService.ITransaction;
    acceptedOffer: factory.action.authorize.offer.product.IObject;
}): factory.action.authorize.offer.product.IResult {
    const acceptedOffers4result = responseBody2resultAcceptedOffer(params);

    // 金額計算
    const amount = acceptedOffers2amount({ acceptedOffers: acceptedOffers4result });

    return {
        price: amount,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        acceptedOffers: acceptedOffers4result,
        ...{
            requestBody: params.requestBody,
            responseBody: params.responseBody
        }
    };
}
