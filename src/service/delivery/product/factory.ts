import * as moment from 'moment';

import * as factory from '../../../factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

export function createProductOwnershipInfo(params: {
    order: factory.order.IOrder;
    acceptedOffer: factory.order.IAcceptedOffer<factory.order.IServiceOutput>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    let ownershipInfo: IOwnershipInfo;

    let ownedThrough: Date;

    // どういう期間でいくらのオファーなのか
    const priceSpec = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
        params.acceptedOffer.priceSpecification;
    if (priceSpec === undefined) {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification');
    }

    const unitPriceSpec
        = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
        priceSpec.priceComponent.find(
            (p) => p.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
        );
    if (unitPriceSpec === undefined) {
        throw new factory.errors.NotFound('Unit Price Specification in Order.acceptedOffers.priceSpecification');
    }

    const referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
    if (typeof referenceQuantityValue !== 'number') {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification.referenceQuantity.value');
    }

    switch (unitPriceSpec.referenceQuantity.unitCode) {
        case factory.unitCode.Ann:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'years')
                .toDate();
            break;

        case factory.unitCode.Day:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'days')
                .toDate();
            break;
        case factory.unitCode.Sec:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'seconds')
                .toDate();
            break;

        default:
            throw new factory.errors.NotImplemented(`Reference quantity unit code '${unitPriceSpec.referenceQuantity.unitCode}' not implemented`);
    }

    const itemOffered = params.acceptedOffer.itemOffered;

    ownershipInfo = {
        project: params.order.project,
        typeOf: 'OwnershipInfo',
        id: '',
        identifier: params.identifier,
        ownedBy: params.order.customer,
        acquiredFrom: params.acquiredFrom,
        ownedFrom: params.ownedFrom,
        ownedThrough: ownedThrough,
        typeOfGood: {
            project: itemOffered.project,
            identifier: itemOffered.identifier,
            issuedThrough: itemOffered.issuedThrough,
            typeOf: itemOffered.typeOf,
            ...((<any>itemOffered).dateIssued !== undefined) ? { dateIssued: (<any>itemOffered).dateIssued } : undefined,
            ...(itemOffered.validFor !== undefined) ? { validFor: itemOffered.validFor } : undefined,
            ...(itemOffered.name !== undefined) ? { name: itemOffered.name } : undefined,
            ...(itemOffered.issuedThrough?.typeOf === 'MembershipService') ? { membershipFor: itemOffered.issuedThrough } : undefined,
            ...(itemOffered.issuedThrough?.typeOf === 'MembershipService') ? { hostingOrganization: itemOffered.issuedBy } : undefined
        }
    };

    return ownershipInfo;
}
