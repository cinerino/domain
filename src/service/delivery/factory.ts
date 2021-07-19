import * as moment from 'moment-timezone';
import * as util from 'util';

import { factory } from '../../factory';

import { availableProductTypes } from '../offer/product/factory';

import { createProductOwnershipInfo } from './product/factory';
import { createReservationOwnershipInfo } from './reservation/factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;

/**
 * 注文から所有権を作成する
 */
export function createOwnershipInfosFromOrder(params: {
    order: factory.order.IOrder;
}): IOwnershipInfo[] {
    const ownershipInfos: IOwnershipInfo[] = [];

    params.order.acceptedOffers.forEach((acceptedOffer, offerIndex) => {
        const itemOffered = acceptedOffer.itemOffered;

        let ownershipInfo: IOwnershipInfo | undefined;

        const ownedFrom = moment(params.order.orderDate)
            .toDate();
        const identifier = createOwnershipInfoIdentifier({ order: params.order, itemOffered, offerIndex });
        const acquiredFrom = createAcquiredFrom(params);
        const ownedBy = createOwnedby(params);

        switch (true) {
            case new RegExp(`^${factory.chevre.reservationType.EventReservation}$`).test(itemOffered.typeOf):
                ownershipInfo = createReservationOwnershipInfo({
                    project: params.order.project,
                    ownedBy: ownedBy,
                    acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
                    ownedFrom: ownedFrom,
                    identifier: identifier,
                    acquiredFrom: acquiredFrom
                });

                break;

            case new RegExp(`^MonetaryAmount$`).test(itemOffered.typeOf):
                // no op
                break;

            default:
                const productType = (<factory.order.IServiceOutput>itemOffered).issuedThrough?.typeOf;
                if (typeof productType === 'string' && availableProductTypes.indexOf(productType) >= 0) {
                    ownershipInfo = createProductOwnershipInfo({
                        project: params.order.project,
                        ownedBy: ownedBy,
                        acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
                        ownedFrom: ownedFrom,
                        identifier: identifier,
                        acquiredFrom: acquiredFrom
                    });
                }

                if (ownershipInfo === undefined) {
                    throw new factory.errors.NotImplemented(`Offered item type ${(<any>itemOffered).typeOf} not implemented`);
                }
        }

        if (ownershipInfo !== undefined) {
            ownershipInfos.push(ownershipInfo);
        }
    });

    return ownershipInfos;
}

function createOwnershipInfoIdentifier(params: {
    order: factory.order.IOrder;
    itemOffered: factory.order.IItemOffered;
    offerIndex: number;
}): string {
    return util.format(
        '%s-%s-%s-%s',
        params.order.customer.id,
        params.itemOffered.typeOf,
        params.order.orderNumber,
        params.offerIndex
    );
}

function createAcquiredFrom(params: {
    order: factory.order.IOrder;
}): factory.ownershipInfo.IOwner {
    // 最低限の情報に絞る
    const seller = params.order.seller;

    return {
        project: { typeOf: params.order.project.typeOf, id: params.order.project.id },
        id: seller.id,
        typeOf: seller.typeOf,
        name: seller.name
    };
}

function createOwnedby(params: {
    order: factory.order.IOrder;
}): factory.ownershipInfo.IOwner {
    // 最低限の情報に絞る
    const customer = params.order.customer;

    return {
        typeOf: <any>customer.typeOf,
        id: customer.id,
        ...(customer.identifier !== undefined) ? { identifier: customer.identifier } : undefined,
        ...(customer.typeOf === factory.personType.Person && customer.memberOf !== undefined) ? { memberOf: customer.memberOf } : undefined,
        ...(customer.familyName !== undefined) ? { familyName: customer.familyName } : undefined,
        ...(customer.givenName !== undefined) ? { givenName: customer.givenName } : undefined,
        ...(customer.name !== undefined) ? { name: customer.name } : undefined
    };
}
