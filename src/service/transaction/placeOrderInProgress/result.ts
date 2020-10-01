import * as moment from 'moment-timezone';

import * as factory from '../../../factory';

import { createProductItems } from './result/acceptedOffers';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult;
export type ISeller = factory.seller.ISeller;

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.monetaryAmount.IAction;
export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type IAuthorizeSeatReservationOfferResult =
    factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier>;

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;

/**
 * 注文を生成する
 */
export function createOrder(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
}): factory.order.IOrder {
    const seller = createSeller({ transaction: params.transaction });
    const customer = createCustomer({ transaction: params.transaction });
    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];

    // 座席予約がある場合
    acceptedOffers.push(...createReservationAcceptedOffers({ ...params, seller: seller }));

    // 通貨転送がある場合
    acceptedOffers.push(...createMoneyTransferAcceptedOffers({ ...params, seller: seller }));

    // Chevreプロダクトがある場合
    acceptedOffers.push(...createProductItems({ ...params }));

    // 決済方法をセット
    const { paymentMethods, price } = createPaymentMethods({ transaction: params.transaction });

    const discounts: factory.order.IDiscount[] = [];

    const name: string | undefined =
        (typeof params.transaction.object.name === 'string') ? params.transaction.object.name : undefined;

    return {
        project: params.transaction.project,
        typeOf: factory.order.OrderType.Order,
        seller: seller,
        customer: customer,
        price: price,
        priceCurrency: factory.priceCurrency.JPY,
        paymentMethods: paymentMethods,
        discounts: discounts,
        confirmationNumber: '',
        orderNumber: '',
        acceptedOffers: acceptedOffers,
        url: '',
        orderStatus: params.orderStatus,
        orderDate: params.orderDate,
        identifier: [],
        isGift: params.isGift,
        ...(typeof name === 'string') ? { name } : undefined
    };
}

function createSeller(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.ISeller {
    const seller = params.transaction.seller;

    return {
        project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
        id: seller.id,
        name: (typeof seller.name === 'string')
            ? seller.name
            : String(seller.name?.ja),
        // legalName: seller.legalName,
        typeOf: seller.typeOf,
        ...(typeof seller.telephone === 'string') ? { telephone: seller.telephone } : undefined,
        ...(typeof seller.url === 'string') ? { url: seller.url } : undefined
    };
}

function createCustomer(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.ICustomer {
    // 購入者を識別する情報をまとめる
    const profile = params.transaction.agent;

    return {
        ...profile,
        identifier: (Array.isArray(profile.identifier)) ? profile.identifier : [],
        name: (typeof profile.name === 'string')
            ? profile.name
            : `${profile.givenName} ${profile.familyName}`,
        ...(typeof profile.url === 'string')
            ? { url: profile.url }
            : undefined
    };
}

function createPaymentMethods(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): {
    paymentMethods: factory.order.IPaymentMethod[];
    price: number;
} {
    const paymentMethods: factory.order.IPaymentMethod[] = [];
    let price = 0;

    const authorizePaymentActions = (<factory.action.authorize.paymentMethod.any.IAction[]>
        params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
            && a.result?.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment);

    // 決済方法をセット
    authorizePaymentActions.forEach((a) => {
        const result = (<factory.action.authorize.paymentMethod.any.IResult>a.result);
        paymentMethods.push({
            accountId: result.accountId,
            additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
            name: result.name,
            paymentMethodId: result.paymentMethodId,
            totalPaymentDue: result.totalPaymentDue,
            typeOf: <any>result.paymentMethod
        });
    });

    // 決済方法から注文金額の計算
    price += authorizePaymentActions
        .filter((a) => {
            return a.result?.totalPaymentDue?.currency === factory.priceCurrency.JPY;
        })
        .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);

    return { paymentMethods, price };
}

function createReservationAcceptedOffers(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    seller: factory.order.ISeller;
}): factory.order.IAcceptedOffer<factory.order.IReservation>[] {
    // 座席予約に対する承認アクション取り出す
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IReservation>[] = [];

    // 座席予約がある場合
    seatReservationAuthorizeActions.forEach((authorizeSeatReservationAction) => {
        if (authorizeSeatReservationAction !== undefined) {
            if (authorizeSeatReservationAction.result === undefined) {
                throw new factory.errors.Argument('Transaction', 'Seat reservation result does not exist');
            }

            let responseBody = authorizeSeatReservationAction.result.responseBody;

            if (authorizeSeatReservationAction.instrument === undefined) {
                authorizeSeatReservationAction.instrument = {
                    typeOf: 'WebAPI',
                    identifier: factory.service.webAPI.Identifier.Chevre
                };
            }

            if (authorizeSeatReservationAction.object.event === undefined
                || authorizeSeatReservationAction.object.event === null) {
                throw new factory.errors.ServiceUnavailable('Authorized event undefined');
            }
            const event: factory.chevre.event.screeningEvent.IEvent = authorizeSeatReservationAction.object.event;

            switch (authorizeSeatReservationAction.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    const updTmpReserveSeatResult = responseBody;

                    // 座席仮予約からオファー情報を生成する
                    // tslint:disable-next-line:max-func-body-length
                    acceptedOffers.push(...updTmpReserveSeatResult.listTmpReserve.map((tmpReserve, index) => {
                        const requestedOffer = authorizeSeatReservationAction.object.acceptedOffer.find((o) => {
                            let offer = o;

                            if ((<any>offer).ticketInfo !== undefined) {
                                offer = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4COA>o;

                                return (offer.seatNumber === tmpReserve.seatNum && offer.seatSection === tmpReserve.seatSection);
                            } else {
                                offer = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4chevre>o;

                                return ((<any>offer).ticketedSeat !== undefined
                                    && (<any>offer).ticketedSeat.seatNumber === tmpReserve.seatNum
                                    && (<any>offer).ticketedSeat.seatSection === tmpReserve.seatSection);

                            }
                        });
                        if (requestedOffer === undefined) {
                            throw new factory.errors.Argument('offers', '要求された供給情報と仮予約結果が一致しません');
                        }

                        let coaInfo: factory.event.screeningEvent.ICOAInfo | undefined;
                        if (event.coaInfo !== undefined) {
                            coaInfo = event.coaInfo;
                        } else {
                            if (Array.isArray(event.additionalProperty)) {
                                // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
                                const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                                coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                            }
                        }

                        if (coaInfo === undefined) {
                            throw new factory.errors.NotFound('Event COA Info');
                        }

                        // チケットトークン(QRコード文字列)を作成
                        const ticketToken = [
                            coaInfo.theaterCode,
                            coaInfo.dateJouei,
                            // tslint:disable-next-line:no-magic-numbers
                            (`00000000${updTmpReserveSeatResult.tmpReserveNum}`).slice(-8),
                            // tslint:disable-next-line:no-magic-numbers
                            (`000${index + 1}`).slice(-3)
                        ].join('');

                        // tslint:disable-next-line:max-line-length
                        // const unitPriceSpec = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
                        //     requestedOffer.priceSpecification.priceComponent.find(
                        //         (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                        //     );
                        // if (unitPriceSpec === undefined) {
                        //     throw new factory.errors.Argument('Accepted Offer', 'Unit price specification not found');
                        // }

                        const reservation: factory.order.IReservation = {
                            project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                            typeOf: factory.chevre.reservationType.EventReservation,
                            id: `${updTmpReserveSeatResult.tmpReserveNum}-${index.toString()}`,
                            bookingTime: moment(authorizeSeatReservationAction.startDate)
                                .toDate(),
                            additionalTicketText: '',
                            numSeats: 1,
                            reservationFor: {
                                ...event,
                                ...(event.doorTime !== undefined)
                                    ? {
                                        doorTime: moment(event.doorTime)
                                            .toDate()
                                    }
                                    : undefined,
                                ...(event.endDate !== undefined)
                                    ? {
                                        endDate: moment(event.endDate)
                                            .toDate()
                                    }
                                    : undefined,
                                ...(event.startDate !== undefined)
                                    ? {
                                        startDate: moment(event.startDate)
                                            .toDate()
                                    }
                                    : undefined,
                                additionalProperty: undefined,
                                offers: undefined,
                                remainingAttendeeCapacity: undefined,
                                maximumAttendeeCapacity: undefined,
                                attendeeCount: undefined,
                                checkInCount: undefined,
                                superEvent: {
                                    ...event.superEvent,
                                    additionalProperty: undefined,
                                    offers: undefined,
                                    workPerformed: {
                                        ...event.superEvent.workPerformed,
                                        offers: undefined
                                    }
                                },
                                workPerformed: (event.workPerformed !== undefined)
                                    ? {
                                        ...event.workPerformed,
                                        offers: undefined
                                    }
                                    : undefined
                            },
                            reservationNumber: `${updTmpReserveSeatResult.tmpReserveNum}`,
                            reservedTicket: {
                                typeOf: 'Ticket',
                                coaTicketInfo: (<any>requestedOffer).ticketInfo,
                                dateIssued: params.orderDate,
                                ticketedSeat: {
                                    typeOf: factory.chevre.placeType.Seat,
                                    // seatingType: 'Default',
                                    seatNumber: tmpReserve.seatNum,
                                    seatRow: '',
                                    seatSection: tmpReserve.seatSection
                                },
                                ticketNumber: ticketToken,
                                ticketToken: ticketToken,
                                ticketType: {
                                    project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                                    typeOf: factory.chevre.offerType.Offer,
                                    id: requestedOffer.id,
                                    identifier: <string>requestedOffer.identifier,
                                    name: <factory.chevre.multilingualString>requestedOffer.name,
                                    description: <factory.chevre.multilingualString>requestedOffer.description,
                                    additionalProperty: requestedOffer.additionalProperty,
                                    priceCurrency: factory.priceCurrency.JPY
                                }
                            }
                        };

                        return {
                            project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                            typeOf: <factory.chevre.offerType>'Offer',
                            id: requestedOffer.id,
                            name: <factory.chevre.multilingualString>requestedOffer.name,
                            itemOffered: reservation,
                            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.COA },
                            priceSpecification: requestedOffer.priceSpecification,
                            priceCurrency: factory.priceCurrency.JPY,
                            seller: {
                                project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
                                typeOf: params.seller.typeOf,
                                name: params.seller.name
                            }
                        };
                    }));

                    break;

                default:
                    if (Array.isArray(authorizeSeatReservationAction.result.acceptedOffers)) {
                        acceptedOffers.push(...authorizeSeatReservationAction.result.acceptedOffers);
                    }
            }
        }
    });

    return acceptedOffers;
}

function createMoneyTransferAcceptedOffers(params: {
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
