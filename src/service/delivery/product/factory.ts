import * as moment from 'moment';

import * as factory from '../../../factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;

// tslint:disable-next-line:cyclomatic-complexity
export function createProductOwnershipInfo(params: {
    project: { typeOf: factory.chevre.organizationType.Project; id: string };
    ownedBy: factory.ownershipInfo.IOwner;
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
        case factory.chevre.unitCode.Ann:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'years')
                .toDate();
            break;

        case factory.chevre.unitCode.Day:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'days')
                .toDate();
            break;
        case factory.chevre.unitCode.Sec:
            ownedThrough = moment(params.ownedFrom)
                .add(referenceQuantityValue, 'seconds')
                .toDate();
            break;

        default:
            throw new factory.errors.NotImplemented(`Reference quantity unit code '${unitPriceSpec.referenceQuantity.unitCode}' not implemented`);
    }

    const itemOffered = params.acceptedOffer.itemOffered;

    const typeOfGood: factory.ownershipInfo.IServiceOutput = {
        project: itemOffered.project,
        identifier: itemOffered.identifier,
        issuedThrough: itemOffered.issuedThrough,
        typeOf: itemOffered.typeOf,
        ...(itemOffered.validFor !== undefined) ? { validFor: itemOffered.validFor } : undefined,
        ...(itemOffered.name !== undefined) ? { name: itemOffered.name } : undefined,
        ...((<any>itemOffered).dateIssued !== undefined) ? { dateIssued: (<any>itemOffered).dateIssued } : undefined,
        ...((<any>itemOffered).membershipFor !== undefined) ? { membershipFor: (<any>itemOffered).membershipFor } : undefined,
        ...((<any>itemOffered).hostingOrganization !== undefined)
            ? { hostingOrganization: (<any>itemOffered).hostingOrganization }
            : undefined,
        ...(typeof (<any>itemOffered).accountNumber === 'string') ? { accountNumber: (<any>itemOffered).accountNumber } : undefined,
        ...(typeof (<any>itemOffered).accountType === 'string') ? { accountType: (<any>itemOffered).accountType } : undefined
    };

    ownershipInfo = {
        project: params.project,
        typeOf: 'OwnershipInfo',
        id: '',
        identifier: params.identifier,
        ownedBy: params.ownedBy,
        acquiredFrom: params.acquiredFrom,
        ownedFrom: params.ownedFrom,
        ownedThrough: ownedThrough,
        typeOfGood: typeOfGood
    };

    return ownershipInfo;
}
