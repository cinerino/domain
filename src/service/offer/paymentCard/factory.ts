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
    object: any;
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
        object: params.object,
        expires: moment(params.transaction.expires)
            .add(1, 'day')
            .toDate() // 余裕を持って
    };
}

export function createAuthorizeActionAttributes(params: {
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
    // event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    // pendingTransaction?: factory.chevre.transaction.ITransaction<factory.chevre.transactionType.Reserve> | undefined;
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

export function acceptedOffers2amount(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[];
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

export function responseBody2acceptedOffers4result(params: {
    responseBody: any;
    project: factory.project.IProject;
    seller: factory.transaction.placeOrder.ISeller;
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
}): any[] {
    let acceptedOffers: any[] = [];
    if (Array.isArray(params.responseBody.object)) {
        acceptedOffers = params.responseBody.object.map((responseBodyObject: any, key: any) => {
            const paymentCard = {
                ...responseBodyObject.itemOffered?.serviceOutput,
                accessCode: 'xxx' // masked
            };

            const offer = params.acceptedOffer[key];

            return {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: responseBodyObject.typeOf,
                id: offer.id,
                name: offer.name,
                itemOffered: paymentCard,
                priceSpecification: offer.priceSpecification,
                priceCurrency: offer.priceCurrency,
                seller: offer.seller
            };
        });
    }

    return acceptedOffers;
}
