import * as moment from 'moment';

import * as chevre from '../../../chevre';
import * as factory from '../../../factory';

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

export function createReserveTransactionStartParams(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    transaction: factory.transaction.ITransaction<any>;
}): factory.chevre.transaction.reserve.IStartParamsWithoutDetail {
    return {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: chevre.factory.transactionType.Reserve,
        agent: {
            typeOf: params.transaction.agent.typeOf,
            name: params.transaction.agent.id,
            ...{
                identifier: [
                    { name: 'transaction', value: params.transaction.id },
                    {
                        name: 'transactionExpires',
                        value: moment(params.transaction.expires)
                            .toISOString()
                    }
                ]
            }
        },
        object: {
            onReservationStatusChanged: {
                informReservation: (params.object !== undefined
                    && params.object !== null
                    && params.object.onReservationStatusChanged !== undefined
                    && params.object.onReservationStatusChanged !== null
                    && Array.isArray(params.object.onReservationStatusChanged.informReservation))
                    ? params.object.onReservationStatusChanged.informReservation
                    : []
            }
        },
        expires: moment(params.transaction.expires)
            .add(1, 'month')
            .toDate() // 余裕を持って
    };
}

export function createAuthorizeSeatReservationActionAttributes(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre>[];
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    pendingTransaction?: factory.chevre.transaction.ITransaction<factory.chevre.transactionType.Reserve> | undefined;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
}): factory.action.authorize.offer.seatReservation.IAttributes<factory.service.webAPI.Identifier> {
    const acceptedOffers = params.acceptedOffers;
    const event = params.event;
    const transaction = params.transaction;

    const offers = event.offers;
    if (offers === undefined) {
        throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
    }
    let offeredThrough = offers.offeredThrough;
    if (offeredThrough === undefined) {
        offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
    }

    return {
        project: transaction.project,
        typeOf: factory.actionType.AuthorizeAction,
        object: {
            typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
            event: {
                additionalProperty: event.additionalProperty,
                alternateName: event.alternateName,
                alternativeHeadline: event.alternativeHeadline,
                description: event.description,
                doorTime: moment(event.doorTime)
                    .toDate(),
                duration: event.duration,
                endDate: moment(event.endDate)
                    .toDate(),
                eventStatus: event.eventStatus,
                headline: event.headline,
                id: event.id,
                location: event.location,
                name: event.name,
                project: event.project,
                startDate: moment(event.startDate)
                    .toDate(),
                superEvent: event.superEvent,
                typeOf: event.typeOf,
                workPerformed: event.workPerformed
            },
            acceptedOffer: acceptedOffers,
            ...(params.pendingTransaction !== undefined)
                ? { pendingTransaction: params.pendingTransaction }
                : {}
        },
        agent: {
            project: transaction.seller.project,
            id: transaction.seller.id,
            typeOf: transaction.seller.typeOf,
            name: transaction.seller.name,
            location: transaction.seller.location,
            telephone: transaction.seller.telephone,
            url: transaction.seller.url,
            image: transaction.seller.image
        },
        recipient: transaction.agent,
        purpose: { typeOf: transaction.typeOf, id: transaction.id },
        instrument: offeredThrough
    };
}

export function acceptedOffers2amount(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[];
}): number {
    const acceptedOffers = params.acceptedOffers;

    // 金額計算
    let amount = acceptedOffers.reduce(
        (a, b) => {
            if (b.priceSpecification === undefined || b.priceSpecification === null) {
                throw new factory.errors.ServiceUnavailable('price specification of result accepted offer undefined');
            }

            if (b.priceSpecification.typeOf !== factory.chevre.priceSpecificationType.CompoundPriceSpecification) {
                throw new factory.errors.ServiceUnavailable('price specification of result accepted offer must be CompoundPriceSpecification');
            }

            const priceSpecification = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>b.priceSpecification;

            return a + priceSpecification.priceComponent.reduce((a2, b2) => a2 + Number(b2.price), 0);
        },
        0
    );

    // オファーIDごとに座席の単価仕様を考慮して金額を調整
    const offerIds = [...new Set(acceptedOffers.map((o) => o.id))];
    offerIds.forEach((offerId) => {
        const acceptedOffersByOfferId = acceptedOffers.filter((o) => o.id === offerId);

        const compoundPriceSpecification
            = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>acceptedOffersByOfferId[0].priceSpecification;

        const unitPriceSpec = <IUnitPriceSpecification>compoundPriceSpecification.priceComponent.find(
            (spec) => {
                const priceSpec = <IUnitPriceSpecification>spec;

                return priceSpec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                    && (!Array.isArray(priceSpec.appliesToAddOn));
            }
        );
        let referenceQuantityValue = unitPriceSpec.referenceQuantity?.value;
        if (typeof referenceQuantityValue !== 'number') {
            referenceQuantityValue = 1;
        }

        amount -= unitPriceSpec.price * (referenceQuantityValue - 1) * (acceptedOffersByOfferId.length / referenceQuantityValue);
    });

    return amount;
}

export function responseBody2acceptedOffers4result(params: {
    responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>;
    event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    project: factory.project.IProject;
    seller: factory.transaction.placeOrder.ISeller;
}): factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] {
    let acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] = [];

    const event = params.event;
    const seller = params.seller;

    // 座席仮予約からオファー情報を生成する
    if (Array.isArray(params.responseBody.object.reservations)) {
        // tslint:disable-next-line:max-func-body-length
        acceptedOffers4result = params.responseBody.object.reservations
            .filter((itemOffered) => {
                const r = itemOffered;
                // 余分確保分を除く(ttts対応)
                let extraProperty: factory.propertyValue.IPropertyValue<string> | undefined;
                if (Array.isArray(r.additionalProperty)) {
                    extraProperty = r.additionalProperty.find((p) => p.name === 'extra');
                }

                return extraProperty === undefined
                    || extraProperty.value !== '1';
            })
            // tslint:disable-next-line:max-func-body-length
            .map((itemOffered) => {
                const reservationFor: IReservationFor = {
                    project: itemOffered.reservationFor.project,
                    typeOf: itemOffered.reservationFor.typeOf,
                    additionalProperty: itemOffered.reservationFor.additionalProperty,
                    eventStatus: itemOffered.reservationFor.eventStatus,
                    id: itemOffered.reservationFor.id,
                    location: itemOffered.reservationFor.location,
                    name: itemOffered.reservationFor.name,
                    doorTime: moment(itemOffered.reservationFor.doorTime)
                        .toDate(),
                    endDate: moment(itemOffered.reservationFor.endDate)
                        .toDate(),
                    startDate: moment(itemOffered.reservationFor.startDate)
                        .toDate(),
                    superEvent: {
                        project: event.superEvent.project,
                        typeOf: event.superEvent.typeOf,
                        duration: event.superEvent.duration,
                        eventStatus: event.superEvent.eventStatus,
                        headline: event.superEvent.headline,
                        id: event.superEvent.id,
                        kanaName: event.superEvent.kanaName,
                        location: event.superEvent.location,
                        name: event.superEvent.name,
                        soundFormat: event.superEvent.soundFormat,
                        videoFormat: event.superEvent.videoFormat,
                        workPerformed: {
                            project: event.superEvent.workPerformed.project,
                            typeOf: event.superEvent.workPerformed.typeOf,
                            duration: event.superEvent.workPerformed.duration,
                            headline: event.superEvent.workPerformed.headline,
                            id: event.superEvent.workPerformed.id,
                            identifier: event.superEvent.workPerformed.identifier,
                            name: event.superEvent.workPerformed.name
                        }
                    },
                    workPerformed: (event.workPerformed !== undefined)
                        ? {
                            project: event.workPerformed.project,
                            typeOf: event.workPerformed.typeOf,
                            duration: event.workPerformed.duration,
                            headline: event.workPerformed.headline,
                            id: event.workPerformed.id,
                            identifier: event.workPerformed.identifier,
                            name: event.workPerformed.name
                        }
                        : undefined
                };

                const reservedTicket: factory.chevre.reservation.ITicket<factory.chevre.reservationType.EventReservation>
                    = {
                    typeOf: itemOffered.reservedTicket.typeOf,
                    ticketType: {
                        project: { typeOf: params.project.typeOf, id: params.project.id },
                        typeOf: itemOffered.reservedTicket.ticketType.typeOf,
                        id: itemOffered.reservedTicket.ticketType.id,
                        identifier: itemOffered.reservedTicket.ticketType.identifier,
                        name: itemOffered.reservedTicket.ticketType.name,
                        description: itemOffered.reservedTicket.ticketType.description,
                        additionalProperty: itemOffered.reservedTicket.ticketType.additionalProperty,
                        priceCurrency: itemOffered.reservedTicket.ticketType.priceCurrency
                    },
                    ...(itemOffered.reservedTicket.ticketedSeat !== undefined)
                        ? { ticketedSeat: itemOffered.reservedTicket.ticketedSeat }
                        : undefined
                };

                const reservation: factory.order.IReservation = {
                    project: itemOffered.project,
                    typeOf: itemOffered.typeOf,
                    additionalProperty: itemOffered.additionalProperty,
                    additionalTicketText: itemOffered.additionalTicketText,
                    id: itemOffered.id,
                    reservationNumber: itemOffered.reservationNumber,
                    reservationFor: reservationFor,
                    reservedTicket: reservedTicket
                };

                const priceSpecification = <IReservationPriceSpecification>itemOffered.price;
                // const unitPrice = (itemOffered.reservedTicket.ticketType.priceSpecification !== undefined)
                //     ? itemOffered.reservedTicket.ticketType.priceSpecification.price
                //     : 0;

                return {
                    project: { typeOf: params.project.typeOf, id: params.project.id },
                    typeOf: <factory.chevre.offerType>'Offer',
                    id: itemOffered.reservedTicket.ticketType.id,
                    name: itemOffered.reservedTicket.ticketType.name,
                    itemOffered: reservation,
                    offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre },
                    // price: unitPrice,
                    priceSpecification: {
                        ...priceSpecification,
                        priceComponent: priceSpecification.priceComponent.map((c) => {
                            return {
                                ...c,
                                accounting: undefined // accountingはorderに不要な情報
                            };
                        })
                    },
                    priceCurrency: (itemOffered.priceCurrency !== undefined)
                        ? itemOffered.priceCurrency
                        : factory.priceCurrency.JPY,
                    seller: {
                        typeOf: seller.typeOf,
                        name: seller.name.ja
                    }
                };
            });
    }

    return acceptedOffers4result;
}

export function createTmpReservations(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre>[];
    // acceptedOffersWithSeatNumber: IAcceptedOfferWithSeatNumber[];
    reservations: factory.chevre.transaction.reserve.ISubReservation[];
}) {
    let tmpReservations: factory.action.authorize.offer.seatReservation.ITmpReservation[] = [];

    const acceptedOffers = params.acceptedOffers;
    const reservations = params.reservations;

    tmpReservations = acceptedOffers
        .filter((o) => {
            const r = o.itemOffered.serviceOutput;
            // 余分確保分を除く
            let extraProperty: factory.propertyValue.IPropertyValue<string> | undefined;
            if (r !== undefined && r !== null && Array.isArray(r.additionalProperty)) {
                extraProperty = r.additionalProperty.find((p) => p.name === 'extra');
            }

            return extraProperty === undefined
                || extraProperty.value !== '1';
        })
        .map((o) => {
            // 該当座席のChevre予約を検索
            const chevreReservation = reservations.find((r) => {
                return r.reservedTicket.ticketedSeat !== undefined
                    && o.ticketedSeat !== undefined
                    && r.reservedTicket.ticketedSeat.seatNumber === o.ticketedSeat.seatNumber;
            });

            if (chevreReservation === undefined) {
                throw new factory.errors.ServiceUnavailable('Reservation not found for an accepted offer');
            }

            const reservationInAcceptedOffer = o.itemOffered.serviceOutput;
            if (reservationInAcceptedOffer === undefined || reservationInAcceptedOffer === null) {
                throw new factory.errors.ServiceUnavailable(`serviceOutput undefined in accepted offer`);
            }

            // let extraReservationIds: string[] | undefined;
            // if (Array.isArray(reservationInAcceptedOffer.additionalProperty)) {
            //     const extraSeatNumbersProperty = reservationInAcceptedOffer.additionalProperty.find(
            //         (p) => p.name === 'extraSeatNumbers'
            //     );
            //     if (extraSeatNumbersProperty !== undefined) {
            //         const extraSeatNumbers: string[] = JSON.parse(extraSeatNumbersProperty.value);
            //         if (extraSeatNumbers.length > 0) {
            //             extraReservationIds = extraSeatNumbers.map((seatNumber) => {
            //                 const extraChevreReservation = reservations.find((r) => {
            //                     return r.reservedTicket.ticketedSeat !== undefined
            //                         && o.ticketedSeat !== undefined
            //                         && r.reservedTicket.ticketedSeat.seatNumber
            //                         === seatNumber;
            //                 });
            //                 if (extraChevreReservation === undefined) {
            //                     throw new factory.errors.ServiceUnavailable(`Unexpected extra seat numbers: ${seatNumber}`);
            //                 }

            //                 return extraChevreReservation.id;
            //             });
            //         }
            //     }
            // }

            return {
                ...reservationInAcceptedOffer,
                additionalTicketText: (typeof reservationInAcceptedOffer.additionalTicketText === 'string')
                    ? reservationInAcceptedOffer.additionalTicketText
                    : '',
                additionalProperty: [
                    ...(Array.isArray(reservationInAcceptedOffer.additionalProperty))
                        ? reservationInAcceptedOffer.additionalProperty : []
                    // ...(Array.isArray(extraReservationIds))
                    //     ? [{ name: 'extraReservationIds', value: JSON.stringify(extraReservationIds) }]
                    //     : []
                ],
                id: chevreReservation.id,
                reservationNumber: chevreReservation.reservationNumber,
                reservedTicket: chevreReservation.reservedTicket
            };
        });

    return tmpReservations;
}
