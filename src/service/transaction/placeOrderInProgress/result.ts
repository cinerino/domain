import * as moment from 'moment-timezone';

import * as factory from '../../../factory';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.moneyTransfer.IAction<factory.accountType>;
export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type IAuthorizeSeatReservationOfferResult =
    factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier>;

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;

/**
 * 注文を生成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrder(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
}): factory.order.IOrder {
    // 座席予約に対する承認アクション取り出す
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // 会員プログラムに対する承認アクションを取り出す
    const programMembershipAuthorizeActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered.typeOf === factory.programMembership.ProgramMembershipType.ProgramMembership);
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipAuthorizeActions.length > 1) {
        throw new factory.errors.NotImplemented('Number of programMembership authorizeAction must be 1');
    }
    const programMembershipAuthorizeAction = programMembershipAuthorizeActions.shift();

    // 通貨転送承認アクション
    const authorizeMoneyTansferActions = <IAuthorizeMoneyTransferOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.actionType.MoneyTransfer);

    const seller: factory.order.ISeller = {
        id: params.transaction.seller.id,
        identifier: params.transaction.seller.identifier,
        name: params.transaction.seller.name.ja,
        legalName: params.transaction.seller.legalName,
        typeOf: params.transaction.seller.typeOf,
        telephone: params.transaction.seller.telephone,
        url: params.transaction.seller.url
    };

    // 購入者を識別する情報をまとめる
    const profile = params.transaction.agent;
    const customer: factory.order.ICustomer = {
        ...profile,
        name: (typeof profile.name === 'string')
            ? profile.name
            : `${profile.givenName} ${profile.familyName}`,
        url: (typeof profile.url === 'string')
            ? profile.url
            : '',
        identifier: (Array.isArray(profile.identifier)) ? profile.identifier : []
    };

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];

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

                                return (offer.ticketedSeat !== undefined
                                    && offer.ticketedSeat.seatNumber === tmpReserve.seatNum
                                    && offer.ticketedSeat.seatSection === tmpReserve.seatSection);

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
                            project: { typeOf: params.project.typeOf, id: params.project.id },
                            typeOf: factory.chevre.reservationType.EventReservation,
                            id: `${updTmpReserveSeatResult.tmpReserveNum}-${index.toString()}`,
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
                                    seatingType: { typeOf: <any>'Default' },
                                    seatNumber: tmpReserve.seatNum,
                                    seatRow: '',
                                    seatSection: tmpReserve.seatSection
                                },
                                ticketNumber: ticketToken,
                                ticketToken: ticketToken,
                                ticketType: {
                                    project: { typeOf: params.project.typeOf, id: params.project.id },
                                    typeOf: <'Offer'>'Offer',
                                    id: requestedOffer.id,
                                    identifier: <string>requestedOffer.identifier,
                                    name: <factory.multilingualString>requestedOffer.name,
                                    description: <factory.multilingualString>requestedOffer.description,
                                    additionalProperty: requestedOffer.additionalProperty,
                                    priceCurrency: factory.priceCurrency.JPY
                                }
                            }
                        };

                        return {
                            typeOf: <factory.chevre.offerType>'Offer',
                            id: requestedOffer.id,
                            name: <factory.multilingualString>requestedOffer.name,
                            itemOffered: reservation,
                            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.COA },
                            priceSpecification: requestedOffer.priceSpecification,
                            priceCurrency: factory.priceCurrency.JPY,
                            seller: {
                                typeOf: seller.typeOf,
                                name: seller.name
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

    // 会員プログラムがある場合
    if (programMembershipAuthorizeAction !== undefined) {
        acceptedOffers.push(programMembershipAuthorizeAction.object);
    }

    // 通貨転送がある場合
    authorizeMoneyTansferActions.forEach((authorizeMoneyTansferAction) => {
        if (authorizeMoneyTansferAction.result === undefined) {
            throw new factory.errors.Argument('Transaction', 'authorize money transfer offer result does not exist');
        }

        // let responseBody = authorizeMoneyTansferAction.result.responseBody;

        acceptedOffers.push({
            typeOf: 'Offer',
            // id: '',
            // name: '',
            itemOffered: {
                typeOf: authorizeMoneyTansferAction.object.typeOf,
                amount: authorizeMoneyTansferAction.object.amount,
                toLocation: authorizeMoneyTansferAction.object.toLocation
            },
            // priceSpecification: requestedOffer.priceSpecification,
            priceCurrency: factory.priceCurrency.JPY,
            seller: {
                typeOf: seller.typeOf,
                name: seller.name
            }
        });

    });

    const discounts: factory.order.IDiscount[] = [];

    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // 決済方法をセット
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.result !== undefined)
                .filter((a) => a.result.paymentMethod === paymentMethodType)
                .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                    const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);
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

    const url = '';

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

    return {
        project: params.project,
        typeOf: 'Order',
        seller: seller,
        customer: customer,
        price: price,
        priceCurrency: factory.priceCurrency.JPY,
        paymentMethods: paymentMethods,
        discounts: discounts,
        confirmationNumber: '',
        orderNumber: '',
        acceptedOffers: acceptedOffers,
        url: url,
        orderStatus: params.orderStatus,
        orderDate: params.orderDate,
        identifier: [],
        isGift: params.isGift
    };
}
