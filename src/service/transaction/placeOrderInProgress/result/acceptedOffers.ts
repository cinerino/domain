import * as factory from '../../../../factory';

import { availableProductTypes } from '../../../offer/product/factory';

export function createProductItems(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.IAcceptedOffer<factory.order.IServiceOutput>[] {
    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IServiceOutput>[] = [];

    const authorizePaymentCardOfferActions = (<factory.action.authorize.offer.product.IAction[]>
        params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) =>
            Array.isArray(a.object)
            && a.object.length > 0
            && a.object[0].typeOf === factory.chevre.offerType.Offer
            && availableProductTypes.indexOf(a.object[0].itemOffered.typeOf) >= 0
        );

    authorizePaymentCardOfferActions.forEach((a) => {
        const resultAcceptedOffers = a.result?.acceptedOffers;
        if (Array.isArray(resultAcceptedOffers)) {
            acceptedOffers.push(...resultAcceptedOffers);
        }
    });

    return acceptedOffers;
}
