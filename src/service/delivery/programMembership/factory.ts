import * as moment from 'moment';

import * as factory from '../../../factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

export function createProgramMembershipOwnershipInfo(params: {
    order: factory.order.IOrder;
    acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    // どういう期間でいくらのオファーなのか
    const priceSpec =
        <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
        params.acceptedOffer.priceSpecification;
    if (priceSpec === undefined) {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification');
    }

    const unitPriceSpec =
        <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
        priceSpec.priceComponent.find(
            (p) => p.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
        );
    if (unitPriceSpec === undefined) {
        throw new factory.errors.NotFound('Unit Price Specification in Order.acceptedOffers.priceSpecification');
    }

    // 期間単位としては秒のみ実装
    if (unitPriceSpec.referenceQuantity.unitCode !== factory.unitCode.Sec) {
        throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for priceSpecification.referenceQuantity.unitCode ');
    }
    const referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
    if (typeof referenceQuantityValue !== 'number') {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification.referenceQuantity.value');
    }
    const ownedThrough = moment(params.ownedFrom)
        .add(referenceQuantityValue, 'seconds')
        .toDate();

    return {
        project: params.order.project,
        id: '',
        typeOf: 'OwnershipInfo',
        identifier: params.identifier,
        ownedBy: params.order.customer,
        acquiredFrom: params.acquiredFrom,
        ownedFrom: params.ownedFrom,
        ownedThrough: ownedThrough,
        typeOfGood: params.acceptedOffer.itemOffered
    };
}
