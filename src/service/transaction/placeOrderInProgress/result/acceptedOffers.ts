import { factory } from '../../../../factory';

import { availableProductTypes } from '../../../offer/product/factory';

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.monetaryAmount.IAction;
export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;

export function createReservationAcceptedOffers(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    // orderDate: Date;
    // seller: factory.order.ISeller;
}): factory.order.IAcceptedOffer<factory.order.IReservation>[] {
    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IReservation>[] = [];

    // 座席予約に対する承認アクション取り出す
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
                && a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    seatReservationAuthorizeActions.forEach((authorizeSeatReservationAction) => {
        const resultAcceptedOffers = authorizeSeatReservationAction.result?.acceptedOffers;
        if (Array.isArray(resultAcceptedOffers)) {
            acceptedOffers.push(...resultAcceptedOffers);
        }

        // if (authorizeSeatReservationAction !== undefined) {
        //     if (authorizeSeatReservationAction.result === undefined) {
        //         throw new factory.errors.Argument('Transaction', 'Seat reservation result does not exist');
        //     }

        //     if (authorizeSeatReservationAction.instrument === undefined) {
        //         authorizeSeatReservationAction.instrument = {
        //             typeOf: 'WebAPI',
        //             identifier: factory.service.webAPI.Identifier.Chevre
        //         };
        //     }

        //     switch (authorizeSeatReservationAction.instrument.identifier) {
        //         case factory.service.webAPI.Identifier.COA:
        //             if (Array.isArray(authorizeSeatReservationAction.result.acceptedOffers)) {
        //                 acceptedOffers.push(...authorizeSeatReservationAction.result.acceptedOffers);
        //             }

        //             break;

        //         default:
        //             if (Array.isArray(authorizeSeatReservationAction.result.acceptedOffers)) {
        //                 acceptedOffers.push(...authorizeSeatReservationAction.result.acceptedOffers);
        //             }
        //     }
        // }
    });

    return acceptedOffers;
}

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

export function createMoneyTransferAcceptedOffers(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    seller: factory.order.ISeller;
}): factory.order.IAcceptedOffer<factory.order.IMonetaryAmount>[] {
    // 通貨転送承認アクション
    const authorizeMoneyTansferActions = (<IAuthorizeMoneyTransferOffer[]>params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IMonetaryAmount>[] = [];

    authorizeMoneyTansferActions.forEach((authorizeMoneyTansferAction) => {
        if (authorizeMoneyTansferAction.result === undefined) {
            throw new factory.errors.Argument('Transaction', 'authorize money transfer offer result does not exist');
        }

        // let responseBody = authorizeMoneyTansferAction.result.responseBody;
        const pendingTransaction = authorizeMoneyTansferAction.object.pendingTransaction;
        if (pendingTransaction !== undefined) {
            const accountType = factory.chevre.priceCurrency.JPY;
            const price: number | undefined = pendingTransaction.object.amount.value;

            acceptedOffers.push({
                project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                typeOf: factory.chevre.offerType.Offer,
                // id: '',
                // name: '',
                itemOffered: {
                    typeOf: 'MonetaryAmount',
                    value: authorizeMoneyTansferAction.object.itemOffered.value,
                    currency: accountType,
                    name: `${authorizeMoneyTansferAction.object.itemOffered.value} ${accountType}`
                },
                price: price,
                // priceSpecification: requestedOffer.priceSpecification,
                priceCurrency: factory.priceCurrency.JPY,
                seller: {
                    project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                    typeOf: params.seller.typeOf,
                    name: params.seller.name
                }
            });
        }
    });

    return acceptedOffers;
}
