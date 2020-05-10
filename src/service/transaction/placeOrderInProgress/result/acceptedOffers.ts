import * as factory from '../../../../factory';

export function createPaymentCardItems(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.IAcceptedOffer<any>[] {
    const acceptedOffers: factory.order.IAcceptedOffer<factory.chevre.paymentMethod.paymentCard.IPaymentCard>[] = [];

    const authorizePaymentCardOfferActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered.typeOf === 'PaymentCard');

    authorizePaymentCardOfferActions.forEach((a) => {
        acceptedOffers.push(...a.result.acceptedOffers);
    });

    return acceptedOffers;
}
