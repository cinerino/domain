import * as moment from 'moment';

import * as chevre from '../../../chevre';
import * as factory from '../../../factory';

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

export function createRegisterServiceStartParams(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.paymentCard.IObject;
    transaction: factory.transaction.ITransaction<any>;
}): factory.chevre.transaction.registerService.IStartParamsWithoutDetail {
    return {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: chevre.factory.transactionType.RegisterService,
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
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
}): factory.action.authorize.offer.paymentCard.IAttributes {
    const transaction = params.transaction;

    return {
        project: transaction.project,
        typeOf: factory.actionType.AuthorizeAction,
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
    acceptedOffers: factory.action.authorize.offer.paymentCard.IResultAcceptedOffer;
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
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
}): factory.action.authorize.offer.paymentCard.IResultAcceptedOffer {
    let acceptedOffers: factory.action.authorize.offer.paymentCard.IResultAcceptedOffer = [];

    if (Array.isArray(params.responseBody.object)) {
        acceptedOffers = params.responseBody.object.map((responseBodyObject) => {
            const itemOffered: factory.order.IServiceOutput = {
                ...responseBodyObject.itemOffered?.serviceOutput,
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: String(responseBodyObject.itemOffered?.serviceOutput?.typeOf),
                accessCode: 'xxx' // masked
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
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
}): factory.action.authorize.offer.paymentCard.IResult {
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
