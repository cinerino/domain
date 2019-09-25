import * as moment from 'moment-timezone';

import * as factory from '../../../factory';

export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

/**
 * 注文取引結果を作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrder(params: {
    project: factory.chevre.project.IProject;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
    // seller: ISeller;
    confirmationNumber: string;
    orderNumber: string;
}): factory.transaction.placeOrder.IResult {
    // tslint:disable-next-line:no-magic-numbers
    // const paymentNo = confirmationNumber.slice(-6);

    const seatReservationAuthorizeAction =
        <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .find((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
    // const creditCardAuthorizeAction = <factory.action.authorize.paymentMethod.creditCard.IAction | undefined>
    //     transaction.object.authorizeActions
    //         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
    //         .find((a) => a.object.typeOf === factory.paymentMethodType.CreditCard);

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

    // let paymentMethodId = '';
    // if (creditCardAuthorizeAction !== undefined && creditCardAuthorizeAction.result !== undefined) {
    //     paymentMethodId = creditCardAuthorizeAction.result.paymentMethodId;
    // }

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
        const chevreReservation = chevreReservations.find((r) => r.id === tmpReservation.id);
        if (chevreReservation === undefined) {
            throw new factory.errors.Argument('Transaction', `Unexpected temporary reservation: ${tmpReservation.id}`);
        }

        return temporaryReservation2confirmed({
            // tmpReservation: tmpReservation,
            chevreReservation: chevreReservation
            // transaction: transaction,
            // orderNumber: orderNumber,
            // paymentNo: paymentNo,
            // gmoOrderId: paymentMethodId,
            // paymentSeatIndex: index.toString(),
            // customer: profile,
            // bookingTime: orderDate,
            // paymentMethodName: paymentMethods[0].name
        });
    });

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = eventReservations.map((r) => {
        const unitPrice = (r.reservedTicket.ticketType.priceSpecification !== undefined)
            ? r.reservedTicket.ticketType.priceSpecification.price
            : 0;

        return {
            typeOf: 'Offer',
            itemOffered: r,
            price: unitPrice,
            priceCurrency: factory.priceCurrency.JPY,
            seller: {
                typeOf: params.transaction.seller.typeOf,
                name: params.transaction.seller.name.ja
            }
        };
    });

    const price: number = eventReservations.reduce(
        (a, b) => {
            const unitPrice = (b.reservedTicket.ticketType.priceSpecification !== undefined)
                ? b.reservedTicket.ticketType.priceSpecification.price
                : 0;

            return a + unitPrice;
        },
        0
    );

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

/**
 * 仮予約から確定予約を生成する
 */
function temporaryReservation2confirmed(params: {
    // tmpReservation: factory.action.authorize.offer.seatReservation.ITmpReservation;
    chevreReservation: factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation>;
    // transaction: factory.transaction.placeOrder.ITransaction;
    // orderNumber: string;
    // paymentNo: string;
    // gmoOrderId: string;
    // paymentSeatIndex: string;
    // customer: factory.transaction.placeOrder.IAgent;
    // bookingTime: Date;
    // paymentMethodName: string;
}): factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation> {
    // const transaction = params.transaction;
    // const customer = params.customer;

    // const underName: factory.chevre.reservation.IUnderName<factory.chevre.reservationType.EventReservation> = {
    //     typeOf: factory.personType.Person,
    //     id: params.transaction.agent.id,
    //     name: `${customer.givenName} ${customer.familyName}`,
    //     familyName: customer.familyName,
    //     givenName: customer.givenName,
    //     email: customer.email,
    //     telephone: customer.telephone,
    //     gender: customer.gender,
    //     identifier: [
    //         { name: 'orderNumber', value: params.orderNumber },
    //         { name: 'paymentNo', value: params.paymentNo },
    //         { name: 'transaction', value: transaction.id },
    //         { name: 'gmoOrderId', value: params.gmoOrderId },
    //         ...(typeof customer.age === 'string')
    //             ? [{ name: 'age', value: customer.age }]
    //             : [],
    //         ...(transaction.agent.identifier !== undefined) ? transaction.agent.identifier : [],
    //         ...(transaction.agent.memberOf !== undefined && transaction.agent.memberOf.membershipNumber !== undefined)
    //             ? [{ name: 'username', value: transaction.agent.memberOf.membershipNumber }]
    //             : [],
    //         ...(params.paymentMethodName !== undefined)
    //             ? [{ name: 'paymentMethod', value: params.paymentMethodName }]
    //             : []
    //     ],
    //     ...{ address: customer.address }
    // };

    return {
        ...params.chevreReservation,

        reservationFor: {
            ...params.chevreReservation.reservationFor,
            doorTime: moment(params.chevreReservation.reservationFor.doorTime)
                .toDate(),
            endDate: moment(params.chevreReservation.reservationFor.endDate)
                .toDate(),
            startDate: moment(params.chevreReservation.reservationFor.startDate)
                .toDate()
        },
        reservationStatus: factory.chevre.reservationStatusType.ReservationConfirmed
        // 以下おそらく不要なので削除する...
        // bookingTime: moment(params.bookingTime)
        //     .toDate(),
        // underName: underName,
        // additionalProperty: [
        //     ...(Array.isArray(params.tmpReservation.additionalProperty)) ? params.tmpReservation.additionalProperty : [],
        //     { name: 'paymentSeatIndex', value: params.paymentSeatIndex }
        // ],
        // additionalTicketText: params.tmpReservation.additionalTicketText
    };
}
