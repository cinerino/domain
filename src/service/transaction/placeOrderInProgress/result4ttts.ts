import * as moment from 'moment-timezone';

import * as factory from '../../../factory';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;

/**
 * 注文を作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrder(params: {
    project: factory.chevre.project.IProject;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
    confirmationNumber: string;
    orderNumber: string;
}): factory.transaction.placeOrder.IResult {
    const seatReservationAuthorizeAction =
        <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .find((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    const authorizeSeatReservationResult =
        <factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>
        seatReservationAuthorizeAction.result;
    const reserveTransaction = authorizeSeatReservationResult.responseBody;
    if (reserveTransaction === undefined) {
        throw new factory.errors.Argument('Transaction', 'Reserve Transaction undefined');
    }

    let tmpReservations = (<factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>
        seatReservationAuthorizeAction.result).tmpReservations;
    tmpReservations = (Array.isArray(tmpReservations)) ? tmpReservations : [];
    const chevreReservations = (Array.isArray(reserveTransaction.object.reservations)) ? reserveTransaction.object.reservations : [];

    const profile = params.transaction.agent;

    const seller: factory.order.ISeller = {
        id: params.transaction.seller.id,
        identifier: params.transaction.seller.identifier,
        name: params.transaction.seller.name.ja,
        legalName: params.transaction.seller.legalName,
        typeOf: params.transaction.seller.typeOf,
        telephone: params.transaction.seller.telephone,
        url: params.transaction.seller.url
    };

    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // 決済方法をセット
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.result !== undefined && a.result.paymentMethod === paymentMethodType)
                .forEach((a: any) => {
                    const authorizePaymentMethodAction =
                        <factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>>a;
                    const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>
                        authorizePaymentMethodAction.result);
                    paymentMethods.push({
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: paymentMethodType
                    });
                });
        });

    // 予約データを作成
    const eventReservations = tmpReservations.map((tmpReservation, _) => {
        const itemOffered = chevreReservations.find((r) => r.id === tmpReservation.id);
        if (itemOffered === undefined) {
            throw new factory.errors.Argument('Transaction', `Unexpected temporary reservation: ${tmpReservation.id}`);
        }

        const reservationFor:
            factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation> = {
            ...itemOffered.reservationFor,
            doorTime: moment(itemOffered.reservationFor.doorTime)
                .toDate(),
            endDate: moment(itemOffered.reservationFor.endDate)
                .toDate(),
            startDate: moment(itemOffered.reservationFor.startDate)
                .toDate(),
            // additionalProperty: undefined,
            maximumAttendeeCapacity: undefined,
            remainingAttendeeCapacity: undefined,
            checkInCount: undefined,
            attendeeCount: undefined,
            offers: undefined,
            superEvent: {
                ...itemOffered.reservationFor.superEvent,
                additionalProperty: undefined,
                maximumAttendeeCapacity: undefined,
                remainingAttendeeCapacity: undefined,
                offers: undefined,
                workPerformed: {
                    ...itemOffered.reservationFor.superEvent.workPerformed,
                    offers: undefined
                }
            },
            workPerformed: (itemOffered.reservationFor.workPerformed !== undefined)
                ? {
                    ...itemOffered.reservationFor.workPerformed,
                    offers: undefined
                }
                : undefined
        };

        return {
            ...itemOffered,
            checkedIn: undefined,
            attended: undefined,
            modifiedTime: undefined,
            reservationStatus: undefined,
            // price: undefined,
            priceCurrency: undefined,
            underName: undefined,
            reservationFor: reservationFor,
            reservedTicket: {
                ...itemOffered.reservedTicket,
                issuedBy: undefined,
                priceCurrency: undefined,
                totalPrice: undefined,
                underName: undefined,
                ticketType: {
                    project: params.project,
                    typeOf: itemOffered.reservedTicket.ticketType.typeOf,
                    id: itemOffered.reservedTicket.ticketType.id,
                    identifier: itemOffered.reservedTicket.ticketType.identifier,
                    name: itemOffered.reservedTicket.ticketType.name,
                    description: itemOffered.reservedTicket.ticketType.description,
                    additionalProperty: itemOffered.reservedTicket.ticketType.additionalProperty,
                    priceCurrency: itemOffered.reservedTicket.ticketType.priceCurrency,
                    priceSpecification: itemOffered.reservedTicket.ticketType.priceSpecification
                }
            }
        };
    });

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = eventReservations.map((r) => {
        const priceSpecification = <IReservationPriceSpecification>r.price;
        const unitPrice = (r.reservedTicket.ticketType.priceSpecification !== undefined)
            ? r.reservedTicket.ticketType.priceSpecification.price
            : 0;

        return {
            typeOf: <factory.chevre.offerType>'Offer',
            itemOffered: r,
            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre },
            price: unitPrice,
            priceSpecification: {
                ...priceSpecification,
                priceComponent: priceSpecification.priceComponent.map((c) => {
                    return {
                        ...c,
                        accounting: undefined // accountingはorderに不要な情報
                    };
                })
            },
            priceCurrency: factory.priceCurrency.JPY,
            seller: {
                typeOf: seller.typeOf,
                name: seller.name
            }
        };
    });

    // 決済方法から注文金額の計算
    let price = 0;
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            price += params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === paymentMethodType)
                .filter((a) => {
                    const totalPaymentDue = (<IAuthorizeAnyPaymentResult>a.result).totalPaymentDue;

                    return totalPaymentDue !== undefined && totalPaymentDue.currency === factory.priceCurrency.JPY;
                })
                .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
        });

    const customerIdentifier = (Array.isArray(params.transaction.agent.identifier)) ? params.transaction.agent.identifier : [];
    const customer: factory.order.ICustomer = {
        ...profile,
        id: params.transaction.agent.id,
        typeOf: params.transaction.agent.typeOf,
        name: `${profile.givenName} ${profile.familyName}`,
        url: '',
        identifier: customerIdentifier
    };

    return {
        order: {
            project: params.project,
            typeOf: 'Order',
            seller: seller,
            customer: customer,
            acceptedOffers: acceptedOffers,
            confirmationNumber: params.confirmationNumber,
            orderNumber: params.orderNumber,
            price: price,
            priceCurrency: factory.priceCurrency.JPY,
            paymentMethods: paymentMethods,
            discounts: [],
            url: '',
            orderStatus: params.orderStatus,
            orderDate: params.orderDate,
            isGift: params.isGift
        }
    };
}
