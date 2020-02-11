import * as createDebug from 'debug';
// import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import {
    ICreateOperation,
    validateAcceptedOffers
} from './seatReservation';
import {
    acceptedOffers2amount,
    createAuthorizeSeatReservationActionAttributes,
    createReserveTransactionStartParams,
    responseBody2acceptedOffers4result
} from './seatReservation/factory';

const debug = createDebug('ttts-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS = 6;

export type IValidateOperation<T> = () => Promise<T>;

// export type IAcceptedOfferWithSeatNumber
//     = factory.chevre.event.screeningEvent.IAcceptedTicketOfferWithoutDetail &
// = factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre> &
// {
// price: number;
// priceCurrency: factory.priceCurrency;
// additionalProperty?: factory.propertyValue.IPropertyValue<string>[];
// itemOffered: {
//     serviceOutput: factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation>;
// };
// };

// export interface IAcceptedOffer {
//     seat_code?: string;
//     ticket_type: string;
//     watcher_name: string;
// }

// enum TicketTypeCategory {
//     Normal = 'Normal',
//     Wheelchair = 'Wheelchair'
// }

enum SeatingType {
    Normal = 'Normal',
    Wheelchair = 'Wheelchair'
}

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

/**
 * tttsのacceptedOfferパラメータ(座席指定なし)に対して
 * 座席指定情報を付加(座席の自動選択)
 * addditionalTicketTextを付加
 * additionalProperty(余分確保分調整のため)を付加
 * する
 */
// tslint:disable-next-line:max-func-body-length
function validateOffers(
    project: factory.project.IProject,
    performance: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>,
    acceptedOffer: factory.chevre.event.screeningEvent.IAcceptedTicketOfferWithoutDetail[],
    // acceptedOffers: IAcceptedOffer[],
    transactionId: string
): IValidateOperation<factory.chevre.event.screeningEvent.IAcceptedTicketOfferWithoutDetail[]> {
    return async () => {
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const acceptedOffersWithSeatNumber: factory.chevre.event.screeningEvent.IAcceptedTicketOfferWithoutDetail[] = [];

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        // チケットオファー検索
        const ticketOffers = await eventService.searchTicketOffers({ id: performance.id });

        // Chevreで全座席オファーを検索
        const screeningRoomSectionOffers = await eventService.searchOffers({ id: performance.id });
        const sectionOffer = screeningRoomSectionOffers[0];

        const seats = sectionOffer.containsPlace;
        const unavailableSeats = seats.filter((s) => {
            return Array.isArray(s.offers)
                && s.offers.length > 0
                && s.offers[0].availability === chevre.factory.itemAvailability.OutOfStock;
        })
            .map((s) => {
                return {
                    seatSection: sectionOffer.branchCode,
                    seatNumber: s.branchCode
                };
            });
        const unavailableSeatNumbers = unavailableSeats.map((s) => s.seatNumber);
        debug('unavailableSeatNumbers:', unavailableSeatNumbers.length);

        // tslint:disable-next-line:max-func-body-length
        for (const offer of acceptedOffer) {
            // リクエストで指定されるのは、券種IDではなく券種コードなので要注意
            const ticketOffer = ticketOffers.find((t) => t.id === offer.id);
            if (ticketOffer === undefined) {
                throw new factory.errors.NotFound('Offer', `Offer ${offer.id} not found`);
            }
            // const unitPriceSpec =
            //     <chevre.factory.priceSpecification.IPriceSpecification<chevre.factory.priceSpecificationType.UnitPriceSpecification>>
            //     ticketOffer.priceSpecification.priceComponent.find((c) => {
            //         return c.typeOf === chevre.factory.priceSpecificationType.UnitPriceSpecification;
            //     });
            // if (unitPriceSpec === undefined) {
            //     throw new factory.errors.NotFound('Unit Price Specification');
            // }
            // const unitPrice = unitPriceSpec.price;
            // if (unitPrice === undefined) {
            //     throw new factory.errors.NotFound('Unit Price');
            // }

            let ticketTypeCategory = SeatingType.Normal;
            if (Array.isArray(ticketOffer.additionalProperty)) {
                const categoryProperty = ticketOffer.additionalProperty.find((p) => p.name === 'category');
                if (categoryProperty !== undefined) {
                    ticketTypeCategory = <SeatingType>categoryProperty.value;
                }
            }

            // まず利用可能な座席は全座席
            let availableSeats = sectionOffer.containsPlace.map((p) => {
                return {
                    branchCode: p.branchCode,
                    seatingType: <factory.chevre.place.seat.ISeatingType><unknown>p.seatingType
                };
            });
            let availableSeatsForAdditionalStocks = sectionOffer.containsPlace.map((p) => {
                return {
                    branchCode: p.branchCode,
                    seatingType: <factory.chevre.place.seat.ISeatingType><unknown>p.seatingType
                };
            });
            debug(availableSeats.length, 'seats exist');

            // 未確保の座席に絞る
            availableSeats = availableSeats.filter((s) => unavailableSeatNumbers.indexOf(s.branchCode) < 0);
            availableSeatsForAdditionalStocks = availableSeatsForAdditionalStocks.filter(
                (s) => unavailableSeatNumbers.indexOf(s.branchCode) < 0
            );

            // 車椅子予約の場合、車椅子座席に絞る
            // 一般予約は、車椅子座席でも予約可能
            const isWheelChairOffer = ticketTypeCategory === SeatingType.Wheelchair;
            if (isWheelChairOffer) {
                // 車椅子予約の場合、車椅子タイプ座席のみ
                availableSeats = availableSeats.filter(
                    (s) => typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Wheelchair
                );

                // 余分確保は一般座席から
                availableSeatsForAdditionalStocks = availableSeatsForAdditionalStocks.filter(
                    (s) => typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Normal
                );

                // 車椅子確保分が一般座席になければ車椅子は0
                if (availableSeatsForAdditionalStocks.length < WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS) {
                    availableSeats = [];
                }
            } else {
                availableSeats = availableSeats.filter(
                    (s) => typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Normal
                );

                // 余分確保なし
                availableSeatsForAdditionalStocks = [];
            }
            debug(availableSeats.length, 'availableSeats exist');

            // 1つ空席を選択(自動選択)
            const selectedSeat = availableSeats.find((s) => unavailableSeatNumbers.indexOf(s.branchCode) < 0);
            debug('selectedSeat:', selectedSeat);
            if (selectedSeat === undefined) {
                throw new factory.errors.AlreadyInUse('action.object', ['offers'], 'No available seats.');
            }
            unavailableSeatNumbers.push(selectedSeat.branchCode);

            // 余分確保分を選択
            const selectedSeatsForAdditionalStocks = availableSeatsForAdditionalStocks.slice(0, WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS);
            unavailableSeatNumbers.push(...selectedSeatsForAdditionalStocks.map((s) => s.branchCode));

            // const ticketType: chevre.factory.ticketType.ITicketType = {
            //     project: ticketOffer.priceSpecification.project,
            //     typeOf: ticketOffer.typeOf,
            //     id: ticketOffer.id,
            //     identifier: ticketOffer.identifier,
            //     name: <any>ticketOffer.name,
            //     priceSpecification: unitPriceSpec,
            //     priceCurrency: ticketOffer.priceCurrency,
            //     additionalProperty: (Array.isArray(ticketOffer.additionalProperty))
            //         ? ticketOffer.additionalProperty
            //         : []
            // };

            const additionalProperty: factory.propertyValue.IPropertyValue<string>[] = [
                ...(Array.isArray(ticketOffer.additionalProperty))
                    ? ticketOffer.additionalProperty
                    : [],
                { name: 'transaction', value: transactionId },
                ...(selectedSeatsForAdditionalStocks.length > 0)
                    ? [{
                        name: 'extraSeatNumbers',
                        value: JSON.stringify(selectedSeatsForAdditionalStocks.map((s) => s.branchCode))
                    }]
                    : []
            ];

            const additionalTicketText = offer.itemOffered?.serviceOutput?.additionalTicketText;

            acceptedOffersWithSeatNumber.push({
                // ...offer,
                // ...ticketOffer,
                id: ticketOffer.id,
                // additionalProperty: (Array.isArray(ticketOffer.additionalProperty))
                //     ? ticketOffer.additionalProperty
                //     : [],
                // price: unitPrice,
                // priceCurrency: factory.priceCurrency.JPY,
                ticketedSeat: {
                    seatSection: sectionOffer.branchCode,
                    seatNumber: selectedSeat.branchCode,
                    seatRow: '',
                    typeOf: factory.chevre.placeType.Seat
                },
                itemOffered: {
                    // serviceType: <any>{},
                    serviceOutput: {
                        // project: { typeOf: project.typeOf, id: project.id },
                        typeOf: factory.chevre.reservationType.EventReservation,
                        // id: '',
                        // reservationNumber: '',
                        // reservationFor: performance,
                        additionalTicketText: additionalTicketText,
                        reservedTicket: {
                            typeOf: <'Ticket'>'Ticket',
                            // priceCurrency: factory.priceCurrency.JPY,
                            ticketedSeat: {
                                seatSection: sectionOffer.branchCode,
                                seatNumber: selectedSeat.branchCode,
                                seatRow: '',
                                seatingType: <any>selectedSeat.seatingType,
                                typeOf: <factory.chevre.placeType.Seat>factory.chevre.placeType.Seat
                            }
                            // ticketType: ticketType
                        },
                        additionalProperty: additionalProperty
                    }
                }
            });

            selectedSeatsForAdditionalStocks.forEach((s) => {
                const additionalProperty4extra: factory.propertyValue.IPropertyValue<string>[] = [
                    ...(Array.isArray(ticketOffer.additionalProperty))
                        ? ticketOffer.additionalProperty
                        : [],
                    { name: 'extra', value: '1' },
                    { name: 'transaction', value: transactionId }
                ];

                acceptedOffersWithSeatNumber.push({
                    // ...offer,
                    // ...ticketOffer,
                    id: ticketOffer.id,
                    // additionalProperty: (Array.isArray(ticketOffer.additionalProperty))
                    //     ? ticketOffer.additionalProperty
                    //     : [],
                    // price: unitPrice,
                    // priceCurrency: factory.priceCurrency.JPY,
                    ticketedSeat: {
                        seatSection: sectionOffer.branchCode,
                        seatNumber: s.branchCode,
                        seatRow: '',
                        typeOf: factory.chevre.placeType.Seat
                    },
                    itemOffered: {
                        // serviceType: <any>{},
                        serviceOutput: {
                            // project: { typeOf: project.typeOf, id: project.id },
                            typeOf: factory.chevre.reservationType.EventReservation,
                            // id: '',
                            // reservationNumber: '',
                            // reservationFor: performance,
                            additionalTicketText: additionalTicketText,
                            reservedTicket: {
                                typeOf: 'Ticket',
                                // priceCurrency: factory.priceCurrency.JPY,
                                ticketedSeat: {
                                    seatSection: sectionOffer.branchCode,
                                    seatNumber: s.branchCode,
                                    seatRow: '',
                                    seatingType: <any>s.seatingType,
                                    typeOf: factory.chevre.placeType.Seat
                                }
                                // ticketType: {
                                //     ...ticketType,
                                //     priceSpecification: {
                                //         ...unitPriceSpec,
                                //         price: 0 // 余分確保分の単価調整
                                //     }
                                // }
                            },
                            additionalProperty: additionalProperty4extra
                        }

                    }
                });
            });
        }

        return acceptedOffersWithSeatNumber;
    };
}

/**
 * 座席予約承認
 */
export function create(params: {
    project: factory.project.IProject;
    // object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre> & {
        // acceptedOffers: IAcceptedOffer[];
        // event: { id: string };
    };
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        movieTicket: MovieTicketRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }): Promise<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined
            || project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const reserveService = new chevre.service.transaction.Reserve({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        if (params.object.event === undefined || params.object.event === null) {
            throw new factory.errors.ArgumentNull('object.event');
        }

        let event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
        event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({ id: params.object.event.id });

        const offers = event.offers;
        if (offers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        let offeredThrough = offers.offeredThrough;
        if (offeredThrough === undefined) {
            offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        // 座席自動選択
        const acceptedOffersWithoutDetail = await validateOffers(
            project,
            event,
            params.object.acceptedOffer,
            params.transaction.id
        )();

        const acceptedOffers = await validateAcceptedOffers({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            object: {
                acceptedOffer: acceptedOffersWithoutDetail.map((o) => {
                    return {
                        ...o,
                        additionalProperty: []
                    };
                }),
                event: params.object.event
            },
            event: event,
            seller: transaction.seller
        })(repos);

        let requestBody: factory.action.authorize.offer.seatReservation.IRequestBody<typeof offeredThrough.identifier>;
        let responseBody: factory.chevre.transaction.ITransaction<factory.chevre.transactionType.Reserve> | undefined;
        let acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] | undefined;

        const startParams = createReserveTransactionStartParams({
            project: project,
            object: params.object,
            transaction: transaction
        });
        const reserveTransaction = await reserveService.start(startParams);

        // 承認アクションを開始
        const actionAttributes = createAuthorizeSeatReservationActionAttributes({
            acceptedOffers: acceptedOffers,
            event: event,
            pendingTransaction: reserveTransaction,
            transaction: transaction
        });
        const action = await repos.action.start(actionAttributes);

        try {
            requestBody = {
                id: reserveTransaction.id,
                object: {
                    event: { id: event.id },
                    acceptedOffer: acceptedOffersWithoutDetail
                }
            };

            responseBody = await reserveService.addReservations(requestBody);

            const tmpReservations = createTmpReservations({
                acceptedOffers,
                reservations: (Array.isArray(responseBody.object.reservations)) ? responseBody.object.reservations : []
            });
            debug(tmpReservations.length, 'tmp reservation(s) created');

            // 座席仮予約からオファー情報を生成する
            acceptedOffers4result = responseBody2acceptedOffers4result({
                responseBody: responseBody,
                // tmpReservations: tmpReservations,
                event: event,
                project: params.project,
                seller: transaction.seller
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = (error instanceof Error) ? { ...error, ...{ message: error.message } } : error;
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            try {
                // 仮予約があれば削除
                if (responseBody !== undefined) {
                    await reserveService.cancel({ id: responseBody.id });
                }
            } catch (error) {
                // no op
                // 失敗したら仕方ない
            }

            throw error;
        }

        // 金額計算
        const amount = acceptedOffers2amount({ acceptedOffers: acceptedOffers });

        // アクションを完了
        const result: factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre> = {
            price: amount,
            priceCurrency: factory.priceCurrency.JPY,
            point: 0,
            requestBody: requestBody,
            responseBody: responseBody,
            ...(acceptedOffers4result !== undefined) ? { acceptedOffers: acceptedOffers4result } : undefined
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

function createTmpReservations(params: {
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
