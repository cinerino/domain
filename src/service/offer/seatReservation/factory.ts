import * as moment from 'moment';

import * as chevre from '../../../chevre';
import { factory } from '../../../factory';

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type IObjectWithoutDetail = factory.action.authorize.offer.seatReservation.IObjectWithoutDetail4chevre;
// export type ICreateObject = {
//     acceptedOffer: factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail4chevre[];
// } & {
//     // acceptedOffer?: factory.event.screeningEvent.IAcceptedTicketOfferWithoutDetail[];
//     // acceptedOffer: IAcceptedTicketOfferWithoutDetail[];
//     broker?: factory.reservation.IBroker<factory.reservationType.EventReservation>;
//     clientUser?: factory.clientUser.IClientUser;
//     reservationFor?: {
//         id: string;
//     };
//     // onReservationStatusChanged?: IOnReservationStatusChanged;
// };

export function createReserveTransactionStartParams(params: {
    project: { id: string };
    // object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    object: IObjectWithoutDetail;
    transaction: factory.transaction.ITransaction<any>;
    transactionNumber: string;
}): factory.chevre.assetTransaction.reserve.IStartParamsWithoutDetail {
    // const informReservationParamsFromObject = params.object?.onReservationStatusChanged?.informReservation;

    return {
        project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
        typeOf: chevre.factory.assetTransactionType.Reserve,
        transactionNumber: params.transactionNumber,
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
            // ...params.object,
            acceptedOffer: params.object.acceptedOffer,
            reservationFor: { id: String(params.object.reservationFor?.id) },
            // event: { id: String(params.object.reservationFor?.id) },
            onReservationStatusChanged: {
                // informReservation: (Array.isArray(informReservationParamsFromObject))
                //     ? informReservationParamsFromObject
                //     : []
                informReservation: []
            },
            ...(params.object.broker !== undefined) ? { broker: params.object.broker } : undefined
        },
        expires: moment(params.transaction.expires)
            .add(1, 'month')
            .toDate() // 余裕を持って
    };
}

export function createAuthorizeSeatReservationActionAttributes(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre>[];
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    pendingTransaction?: factory.chevre.assetTransaction.ITransaction<factory.chevre.assetTransactionType.Reserve> | undefined;
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
            name: transaction.seller.name
        },
        recipient: {
            typeOf: transaction.agent.typeOf,
            id: transaction.agent.id,
            ...(transaction.agent.identifier !== undefined) ? { identifier: transaction.agent.identifier } : undefined,
            ...(transaction.agent.memberOf !== undefined) ? { memberOf: transaction.agent.memberOf } : undefined
        },
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

    // 予約取引からacceptedOffers4resultを生成する
    if (Array.isArray(params.responseBody.object.reservations)) {
        acceptedOffers4result = params.responseBody.object.reservations
            .map((itemOffered) => {
                const reservation = createReservation({ project: params.project, itemOffered, event: params.event });

                const priceSpecification = <IReservationPriceSpecification>itemOffered.price;

                const priceComponent: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType>[]
                    = priceSpecification.priceComponent.map((c) => {
                        return {
                            ...c,
                            // 勘定科目情報を最低限にする
                            ...(typeof c.accounting?.typeOf === 'string')
                                ? {
                                    accounting: {
                                        typeOf: c.accounting.typeOf,
                                        ...(typeof c.accounting.operatingRevenue?.typeOf === 'string')
                                            ? {
                                                operatingRevenue: {
                                                    project: c.accounting.operatingRevenue.project,
                                                    typeOf: c.accounting.operatingRevenue.typeOf,
                                                    codeValue: c.accounting.operatingRevenue.codeValue
                                                }
                                            }
                                            : undefined
                                        // accountsReceivable: c.accounting.accountsReceivable
                                    }
                                }
                                : undefined
                        };
                    });

                return {
                    project: { typeOf: params.project.typeOf, id: params.project.id },
                    typeOf: factory.chevre.offerType.Offer,
                    id: itemOffered.reservedTicket.ticketType.id,
                    name: itemOffered.reservedTicket.ticketType.name,
                    itemOffered: reservation,
                    offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre },
                    priceSpecification: {
                        ...priceSpecification,
                        priceComponent: priceComponent
                    },
                    priceCurrency: (typeof itemOffered.priceCurrency === 'string')
                        ? itemOffered.priceCurrency
                        : factory.priceCurrency.JPY,
                    seller: {
                        project: { typeOf: params.project.typeOf, id: params.project.id },
                        typeOf: params.seller.typeOf,
                        name: (typeof params.seller.name === 'string')
                            ? params.seller.name
                            : String(params.seller.name?.ja)
                    }
                };
            });
    }

    return acceptedOffers4result;
}

/**
 * 注文データの予約を生成する
 */
function createReservation(params: {
    project: factory.project.IProject;
    itemOffered: factory.chevre.assetTransaction.reserve.ISubReservation;
    event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
}): factory.order.IReservation {
    const itemOffered = params.itemOffered;
    const event = params.event;

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

    return {
        project: itemOffered.project,
        typeOf: itemOffered.typeOf,
        additionalProperty: itemOffered.additionalProperty,
        additionalTicketText: itemOffered.additionalTicketText,
        id: itemOffered.id,
        reservationNumber: itemOffered.reservationNumber,
        reservationFor: reservationFor,
        reservedTicket: reservedTicket
    };
}
