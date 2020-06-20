import * as util from 'util';

import * as factory from '../../factory';

import { availableProductTypes } from '../offer/product/factory';

import { createProductOwnershipInfo } from './product/factory';
// import { createProgramMembershipOwnershipInfo } from './programMembership/factory';
import { createReservationOwnershipInfo } from './reservation/factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

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

        const ownedFrom = params.order.orderDate;

        const seller = params.order.seller;
        const acquiredFrom = {
            project: params.order.project,
            id: seller.id,
            typeOf: seller.typeOf,
            name: { ja: seller.name, en: '' },
            telephone: seller.telephone,
            url: seller.url
        };

        const identifier = util.format(
            '%s-%s-%s-%s',
            params.order.customer.id,
            itemOffered.typeOf,
            params.order.orderNumber,
            offerIndex
        );

        switch (true) {
            // case new RegExp(`^${factory.chevre.programMembership.ProgramMembershipType.ProgramMembership}$`).test(itemOffered.typeOf):
            //     ownershipInfo = createProgramMembershipOwnershipInfo({
            //         order: params.order,
            //         acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
            //         ownedFrom: ownedFrom,
            //         identifier: identifier,
            //         acquiredFrom: acquiredFrom
            //     });

            //     break;

            case new RegExp(`^${factory.chevre.reservationType.EventReservation}$`).test(itemOffered.typeOf):
                ownershipInfo = createReservationOwnershipInfo({
                    order: params.order,
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
                // tslint:disable-next-line:no-suspicious-comment
                // TODO Chevre決済カードサービスに対して動的にコントロール
                const productType = (<factory.order.IServiceOutput>itemOffered).issuedThrough?.typeOf;
                if (typeof productType === 'string' && availableProductTypes.indexOf(productType) >= 0) {
                    ownershipInfo = createProductOwnershipInfo({
                        order: params.order,
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
