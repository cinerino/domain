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
        object: {
            ...params.object
        },
        expires: moment(params.transaction.expires)
            .add(1, 'month')
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
    let amount = acceptedOffers.reduce(
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

    // オファーIDごとに座席の単価仕様を考慮して金額を調整
    const offerIds = [...new Set(acceptedOffers.map((o) => o.id))];
    offerIds.forEach((offerId) => {
        const acceptedOffersByOfferId = acceptedOffers.filter((o) => o.id === offerId);

        const compoundPriceSpecification
            = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>acceptedOffersByOfferId[0].priceSpecification;

        const unitPriceSpec = <IUnitPriceSpecification>compoundPriceSpecification.priceComponent.find(
            (spec) => {
                const priceSpec = <IUnitPriceSpecification>spec;

                return priceSpec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                    && (!Array.isArray(priceSpec.appliesToAddOn));
            }
        );
        let referenceQuantityValue = unitPriceSpec.referenceQuantity?.value;
        if (typeof referenceQuantityValue !== 'number') {
            referenceQuantityValue = 1;
        }

        amount -= unitPriceSpec.price * (referenceQuantityValue - 1) * (acceptedOffersByOfferId.length / referenceQuantityValue);
    });

    return amount;
}

export function responseBody2acceptedOffers4result(params: {
    responseBody: any;
    project: factory.project.IProject;
    seller: factory.transaction.placeOrder.ISeller;
}): any[] {
    const seller = params.seller;

    const paymentCard = {
        ...params.responseBody.object.itemOffered?.serviceOutput,
        accessCode: 'xxx' // masked
    };

    const unitPriceSpec:
        factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification> = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
        name: {
            ja: '発行手数料無料',
            en: 'Free'
        },
        priceCurrency: factory.chevre.priceCurrency.JPY,
        price: 0,
        referenceQuantity: {
            typeOf: 'QuantitativeValue',
            unitCode: factory.chevre.unitCode.Ann,
            value: 1
        },
        valueAddedTaxIncluded: true
    };

    const priceSpecification: factory.chevre.compoundPriceSpecification.IPriceSpecification<any> = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        priceComponent: [unitPriceSpec],
        valueAddedTaxIncluded: true
    };

    return [{
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.offerType.Offer,
        id: 'dummy',
        name: unitPriceSpec.name,
        itemOffered: paymentCard,
        priceSpecification: priceSpecification,
        priceCurrency: factory.priceCurrency.JPY,
        seller: {
            typeOf: seller.typeOf,
            name: seller.name.ja
        }
    }];
}
