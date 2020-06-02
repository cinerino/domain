import * as factory from '../../../../factory';

export function createPaymentCardItems(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.IAcceptedOffer<any>[] {
    const acceptedOffers: factory.order.IAcceptedOffer<factory.chevre.paymentMethod.paymentCard.IPaymentCard>[] = [];

    const authorizePaymentCardOfferActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) =>
            Array.isArray(a.object)
            && a.object.length > 0
            && a.object[0].typeOf === factory.chevre.offerType.Offer
            && a.object[0].itemOffered.typeOf === factory.paymentMethodType.PaymentCard
        );

    authorizePaymentCardOfferActions.forEach((a) => {
        acceptedOffers.push(...a.result.acceptedOffers);
    });

    return acceptedOffers;
}
