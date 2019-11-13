import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as ProjectRepo } from '../../../../../../repo/project';
import { RedisRepository as TicketTypeCategoryRateLimitRepo } from '../../../../../../repo/rateLimit/ticketTypeCategory';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import { credentials } from '../../../../../../credentials';

import * as chevre from '../../../../../../chevre';
import * as factory from '../../../../../../factory';

const debug = createDebug('ttts-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS = (process.env.WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS !== undefined)
    ? Number(process.env.WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS)
    // tslint:disable-next-line:no-magic-numbers
    : 6;

const WHEEL_CHAIR_RATE_LIMIT_UNIT_IN_SECONDS = 3600;

export type ICreateOpetaiton<T> = (
    actionRepo: ActionRepo,
    ticketTypeCategoryRateLimitRepo: TicketTypeCategoryRateLimitRepo,
    transactionRepo: TransactionRepo,
    projectRepo: ProjectRepo
) => Promise<T>;

export type ICancelOpetaiton<T> = (
    transactionRepo: TransactionRepo,
    actionRepo: ActionRepo,
    ticketTypeCategoryRateLimitRepo: TicketTypeCategoryRateLimitRepo,
    projectRepo: ProjectRepo
) => Promise<T>;

export type IValidateOperation<T> = () => Promise<T>;

export interface IAcceptedOfferWithSeatNumber {
    price: number;
    priceCurrency: factory.priceCurrency;
    additionalProperty?: factory.propertyValue.IPropertyValue<string>[];
    itemOffered: factory.action.authorize.offer.seatReservation.ITmpReservation;
}

export interface IAcceptedOffer {
    seat_code?: string;
    ticket_type: string;
    watcher_name: string;
}

enum TicketTypeCategory {
    Normal = 'Normal',
    Wheelchair = 'Wheelchair'
}

enum SeatingType {
    Normal = 'Normal',
    Wheelchair = 'Wheelchair'
}

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;

/**
 * オファーのバリデーション
 * 座席の自動選択を含む
 */
// tslint:disable-next-line:max-func-body-length
function validateOffers(
    project: factory.project.IProject,
    performance: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>,
    acceptedOffers: IAcceptedOffer[],
    transactionId: string
): IValidateOperation<IAcceptedOfferWithSeatNumber[]> {
    return async () => {
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const acceptedOffersWithSeatNumber: IAcceptedOfferWithSeatNumber[] = [];

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
        for (const offer of acceptedOffers) {
            // リクエストで指定されるのは、券種IDではなく券種コードなので要注意
            const ticketOffer = ticketOffers.find((t) => t.identifier === offer.ticket_type);
            if (ticketOffer === undefined) {
                throw new factory.errors.NotFound('Offer', `Offer ${offer.ticket_type} not found`);
            }
            const unitPriceSpec =
                <chevre.factory.priceSpecification.IPriceSpecification<chevre.factory.priceSpecificationType.UnitPriceSpecification>>
                ticketOffer.priceSpecification.priceComponent.find((c) => {
                    return c.typeOf === chevre.factory.priceSpecificationType.UnitPriceSpecification;
                });
            if (unitPriceSpec === undefined) {
                throw new factory.errors.NotFound('Unit Price Specification');
            }
            const unitPrice = unitPriceSpec.price;
            if (unitPrice === undefined) {
                throw new factory.errors.NotFound('Unit Price');
            }

            let ticketTypeCategory = TicketTypeCategory.Normal;
            if (Array.isArray(ticketOffer.additionalProperty)) {
                const categoryProperty = ticketOffer.additionalProperty.find((p) => p.name === 'category');
                if (categoryProperty !== undefined) {
                    ticketTypeCategory = <TicketTypeCategory>categoryProperty.value;
                }
            }

            // まず利用可能な座席は全座席
            let availableSeats = sectionOffer.containsPlace.map((p) => {
                return {
                    branchCode: p.branchCode,
                    seatingType: <factory.chevre.place.movieTheater.ISeatingType><unknown>p.seatingType
                };
            });
            let availableSeatsForAdditionalStocks = sectionOffer.containsPlace.map((p) => {
                return {
                    branchCode: p.branchCode,
                    seatingType: <factory.chevre.place.movieTheater.ISeatingType><unknown>p.seatingType
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
            const isWheelChairOffer = ticketTypeCategory === TicketTypeCategory.Wheelchair;
            if (isWheelChairOffer) {
                // 車椅子予約の場合、車椅子タイプ座席のみ
                availableSeats = availableSeats.filter(
                    (s) => s.seatingType.typeOf === <string>SeatingType.Wheelchair
                );

                // 余分確保は一般座席から
                availableSeatsForAdditionalStocks = availableSeatsForAdditionalStocks.filter(
                    (s) => s.seatingType.typeOf === <string>SeatingType.Normal
                );

                // 車椅子確保分が一般座席になければ車椅子は0
                if (availableSeatsForAdditionalStocks.length < WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS) {
                    availableSeats = [];
                }
            } else {
                availableSeats = availableSeats.filter(
                    (s) => s.seatingType.typeOf === <string>SeatingType.Normal
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

            const ticketType: chevre.factory.ticketType.ITicketType = {
                project: ticketOffer.priceSpecification.project,
                typeOf: ticketOffer.typeOf,
                id: ticketOffer.id,
                identifier: ticketOffer.identifier,
                name: <any>ticketOffer.name,
                priceSpecification: unitPriceSpec,
                priceCurrency: ticketOffer.priceCurrency,
                additionalProperty: ticketOffer.additionalProperty
            };

            acceptedOffersWithSeatNumber.push({
                ...offer,
                additionalProperty: ticketOffer.additionalProperty,
                price: unitPrice,
                priceCurrency: factory.priceCurrency.JPY,
                itemOffered: {
                    id: '',
                    reservationNumber: '',
                    additionalTicketText: offer.watcher_name,
                    reservedTicket: {
                        typeOf: 'Ticket',
                        priceCurrency: factory.priceCurrency.JPY,
                        ticketedSeat: {
                            seatSection: sectionOffer.branchCode,
                            seatNumber: selectedSeat.branchCode,
                            seatRow: '',
                            seatingType: <any>selectedSeat.seatingType,
                            typeOf: factory.chevre.placeType.Seat
                        },
                        ticketType: ticketType
                    },
                    additionalProperty: [
                        { name: 'transaction', value: transactionId },
                        ...(selectedSeatsForAdditionalStocks.length > 0)
                            ? [{
                                name: 'extraSeatNumbers',
                                value: JSON.stringify(selectedSeatsForAdditionalStocks.map((s) => s.branchCode))
                            }]
                            : []
                    ]
                }
            });

            selectedSeatsForAdditionalStocks.forEach((s) => {
                acceptedOffersWithSeatNumber.push({
                    ...offer,
                    additionalProperty: ticketOffer.additionalProperty,
                    price: unitPrice,
                    priceCurrency: factory.priceCurrency.JPY,
                    itemOffered: {
                        id: '',
                        reservationNumber: '',
                        additionalTicketText: offer.watcher_name,
                        reservedTicket: {
                            typeOf: 'Ticket',
                            priceCurrency: factory.priceCurrency.JPY,
                            ticketedSeat: {
                                seatSection: sectionOffer.branchCode,
                                seatNumber: s.branchCode,
                                seatRow: '',
                                seatingType: <any>s.seatingType,
                                typeOf: factory.chevre.placeType.Seat
                            },
                            ticketType: {
                                ...ticketType,
                                priceSpecification: {
                                    ...unitPriceSpec,
                                    price: 0 // 余分確保分の単価調整
                                }
                            }
                        },
                        additionalProperty: [
                            { name: 'extra', value: '1' },
                            { name: 'transaction', value: transactionId }
                        ]
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
        acceptedOffers: IAcceptedOffer[];
        event: { id: string };
    };
    agent: { id: string };
    transaction: { id: string };
}): ICreateOpetaiton<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> {
    // tslint:disable-next-line:max-func-body-length
    return async (
        actionRepo: ActionRepo,
        ticketTypeCategoryRateLimitRepo: TicketTypeCategoryRateLimitRepo,
        transactionRepo: TransactionRepo,
        projectRepo: ProjectRepo
    ): Promise<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> => {
        debug('creating seatReservation authorizeAction...acceptedOffers:', params.object.acceptedOffers.length);

        const project = await projectRepo.findById({ id: params.project.id });
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

        const transaction = await transactionRepo.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // Chevreからイベント情報取得
        const performance = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({ id: params.object.event.id });

        // 供給情報の有効性を確認
        const acceptedOffersWithSeatNumber = await validateOffers(
            project,
            performance,
            params.object.acceptedOffers,
            params.transaction.id
        )();

        let requestBody: factory.chevre.transaction.reserve.IStartParamsWithoutDetail | undefined;
        let responseBody: factory.chevre.transaction.ITransaction<factory.chevre.transactionType.Reserve> | undefined;

        requestBody = {
            project: { typeOf: project.typeOf, id: project.id },
            typeOf: chevre.factory.transactionType.Reserve,
            agent: {
                typeOf: transaction.agent.typeOf,
                name: transaction.agent.id,
                ...{
                    identifier: [
                        { name: 'transaction', value: transaction.id }
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
            expires: moment(performance.endDate)
                .add(1, 'month')
                .toDate()
        };

        // Chevre予約の場合、まず予約取引開始
        const reserveTransaction = await reserveService.start(requestBody);

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes<factory.service.webAPI.Identifier.Chevre> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                event: {
                    id: performance.id,
                    doorTime: moment(performance.doorTime)
                        .toDate(),
                    startDate: moment(performance.startDate)
                        .toDate(),
                    endDate: moment(performance.endDate)
                        .toDate(),
                    superEvent: performance.superEvent,
                    location: performance.location,
                    additionalProperty: performance.additionalProperty,
                    duration: <string>performance.duration,
                    name: performance.name,
                    eventStatus: performance.eventStatus,
                    project: performance.project,
                    typeOf: performance.typeOf
                },
                acceptedOffer: acceptedOffersWithSeatNumber.map((o) => {
                    return <any>{
                        id: o.itemOffered.reservedTicket.ticketType.id,
                        ticketedSeat: o.itemOffered.reservedTicket.ticketedSeat
                    };
                }),
                ...(reserveTransaction !== undefined)
                    ? { pendingTransaction: reserveTransaction }
                    : {},
                ...{ offers: params.object.acceptedOffers }
            },
            agent: transaction.seller,
            recipient: {
                id: transaction.agent.id,
                typeOf: factory.personType.Person
            },
            purpose: { typeOf: <factory.transactionType.PlaceOrder>transaction.typeOf, id: transaction.id }
        };
        const action = await actionRepo.start(actionAttributes);

        // 在庫から仮予約
        let tmpReservations: factory.action.authorize.offer.seatReservation.ITmpReservation[] = [];
        let acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] | undefined;

        const performanceStartDate = moment(performance.startDate)
            .toDate();

        try {
            // 車椅子予約がある場合、レート制限
            await Promise.all(acceptedOffersWithSeatNumber
                .filter((o) => {
                    const r = o.itemOffered;
                    // 余分確保分を除く
                    let extraProperty: factory.propertyValue.IPropertyValue<string> | undefined;
                    if (r.additionalProperty !== undefined) {
                        extraProperty = r.additionalProperty.find((p) => p.name === 'extra');
                    }

                    return r.additionalProperty === undefined
                        || extraProperty === undefined
                        || extraProperty.value !== '1';
                })
                .map(async (offer) => {
                    let ticketTypeCategory = TicketTypeCategory.Normal;
                    if (Array.isArray(offer.additionalProperty)) {
                        const categoryProperty = offer.additionalProperty.find((p) => p.name === 'category');
                        if (categoryProperty !== undefined) {
                            ticketTypeCategory = <TicketTypeCategory>categoryProperty.value;
                        }
                    }

                    if (ticketTypeCategory === TicketTypeCategory.Wheelchair) {
                        // 車椅子レート制限枠確保(取引IDを保持者に指定)
                        await ticketTypeCategoryRateLimitRepo.lock(
                            {
                                performanceStartDate: performanceStartDate,
                                ticketTypeCategory: ticketTypeCategory,
                                unitInSeconds: WHEEL_CHAIR_RATE_LIMIT_UNIT_IN_SECONDS
                            },
                            transaction.id
                        );
                        debug('wheelchair rate limit checked.');
                    }
                })
            );

            responseBody = await reserveService.addReservations({
                id: reserveTransaction.id,
                object: {
                    event: {
                        id: performance.id
                    },
                    acceptedOffer: acceptedOffersWithSeatNumber.map((o) => {
                        const ticketedSeat = o.itemOffered.reservedTicket.ticketedSeat;
                        if (ticketedSeat === undefined) {
                            throw new Error('ticketedSeat undefined');
                        }

                        return {
                            id: o.itemOffered.reservedTicket.ticketType.id,
                            ticketedSeat: {
                                typeOf: chevre.factory.placeType.Seat,
                                seatSection: ticketedSeat.seatSection,
                                seatNumber: ticketedSeat.seatNumber,
                                seatRow: ''
                            }
                        };
                    })
                }
            });

            const reservations = (Array.isArray(responseBody.object.reservations)) ? responseBody.object.reservations : [];
            tmpReservations = acceptedOffersWithSeatNumber
                .filter((o) => {
                    const r = o.itemOffered;
                    // 余分確保分を除く
                    let extraProperty: factory.propertyValue.IPropertyValue<string> | undefined;
                    if (r.additionalProperty !== undefined) {
                        extraProperty = r.additionalProperty.find((p) => p.name === 'extra');
                    }

                    return r.additionalProperty === undefined
                        || extraProperty === undefined
                        || extraProperty.value !== '1';
                })
                .map((o) => {
                    // 該当座席のChevre予約を検索
                    const chevreReservation = reservations.find((r) => {
                        return r.reservedTicket.ticketedSeat !== undefined
                            && o.itemOffered.reservedTicket.ticketedSeat !== undefined
                            && r.reservedTicket.ticketedSeat.seatNumber === o.itemOffered.reservedTicket.ticketedSeat.seatNumber;
                    });

                    if (chevreReservation === undefined) {
                        throw new factory.errors.ServiceUnavailable('Reservation not found for an accepted offer');
                    }

                    let extraReservationIds: string[] | undefined;
                    if (Array.isArray(o.itemOffered.additionalProperty)) {
                        const extraSeatNumbersProperty = o.itemOffered.additionalProperty.find((p) => p.name === 'extraSeatNumbers');
                        if (extraSeatNumbersProperty !== undefined) {
                            const extraSeatNumbers: string[] = JSON.parse(extraSeatNumbersProperty.value);
                            if (extraSeatNumbers.length > 0) {
                                extraReservationIds = extraSeatNumbers.map((seatNumber) => {
                                    const extraChevreReservation = reservations.find((r) => {
                                        return r.reservedTicket.ticketedSeat !== undefined
                                            && o.itemOffered.reservedTicket.ticketedSeat !== undefined
                                            && r.reservedTicket.ticketedSeat.seatNumber
                                            === seatNumber;
                                    });
                                    if (extraChevreReservation === undefined) {
                                        throw new factory.errors.ServiceUnavailable(`Unexpected extra seat numbers: ${o.itemOffered.id}`);
                                    }

                                    return extraChevreReservation.id;
                                });
                            }
                        }
                    }

                    return {
                        ...o.itemOffered,
                        additionalProperty: [
                            ...(Array.isArray(o.itemOffered.additionalProperty))
                                ? o.itemOffered.additionalProperty : [],
                            ...(Array.isArray(extraReservationIds))
                                ? [{ name: 'extraReservationIds', value: JSON.stringify(extraReservationIds) }]
                                : []
                        ],
                        id: chevreReservation.id,
                        reservationNumber: chevreReservation.reservationNumber,
                        reservedTicket: chevreReservation.reservedTicket
                    };
                });
            debug(tmpReservations.length, 'tmp reservation(s) created');

            // 予約データを作成
            // tslint:disable-next-line:max-func-body-length
            acceptedOffers4result = tmpReservations.map((tmpReservation) => {
                const itemOffered = reservations.find((r) => r.id === tmpReservation.id);
                if (itemOffered === undefined) {
                    throw new factory.errors.Argument('Transaction', `Unexpected temporary reservation: ${tmpReservation.id}`);
                }

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
                        project: performance.superEvent.project,
                        typeOf: performance.superEvent.typeOf,
                        duration: performance.superEvent.duration,
                        eventStatus: performance.superEvent.eventStatus,
                        headline: performance.superEvent.headline,
                        id: performance.superEvent.id,
                        kanaName: performance.superEvent.kanaName,
                        location: performance.superEvent.location,
                        name: performance.superEvent.name,
                        soundFormat: performance.superEvent.soundFormat,
                        videoFormat: performance.superEvent.videoFormat,
                        workPerformed: {
                            project: performance.superEvent.workPerformed.project,
                            typeOf: performance.superEvent.workPerformed.typeOf,
                            duration: performance.superEvent.workPerformed.duration,
                            headline: performance.superEvent.workPerformed.headline,
                            id: performance.superEvent.workPerformed.id,
                            identifier: performance.superEvent.workPerformed.identifier,
                            name: performance.superEvent.workPerformed.name
                        }
                    },
                    workPerformed: (performance.workPerformed !== undefined)
                        ? {
                            project: performance.workPerformed.project,
                            typeOf: performance.workPerformed.typeOf,
                            duration: performance.workPerformed.duration,
                            headline: performance.workPerformed.headline,
                            id: performance.workPerformed.id,
                            identifier: performance.workPerformed.identifier,
                            name: performance.workPerformed.name
                        }
                        : undefined
                };

                const reservedTicket: factory.chevre.reservation.ITicket<factory.chevre.reservationType.EventReservation>
                    = {
                    typeOf: itemOffered.reservedTicket.typeOf,
                    ticketType: {
                        project: { typeOf: project.typeOf, id: project.id },
                        typeOf: itemOffered.reservedTicket.ticketType.typeOf,
                        id: itemOffered.reservedTicket.ticketType.id,
                        identifier: itemOffered.reservedTicket.ticketType.identifier,
                        name: itemOffered.reservedTicket.ticketType.name,
                        description: itemOffered.reservedTicket.ticketType.description,
                        additionalProperty: itemOffered.reservedTicket.ticketType.additionalProperty,
                        priceCurrency: itemOffered.reservedTicket.ticketType.priceCurrency
                        // priceSpecification: itemOffered.reservedTicket.ticketType.priceSpecification // 必要ないことが確実になったら削除
                    },
                    ...(itemOffered.reservedTicket.ticketedSeat !== undefined)
                        ? { ticketedSeat: itemOffered.reservedTicket.ticketedSeat }
                        : undefined
                };

                const reservation: factory.order.IReservation = {
                    project: itemOffered.project,
                    typeOf: itemOffered.typeOf,
                    additionalProperty: tmpReservation.additionalProperty,
                    additionalTicketText: tmpReservation.additionalTicketText,
                    id: itemOffered.id,
                    price: itemOffered.price,
                    reservationNumber: itemOffered.reservationNumber,
                    reservationFor: reservationFor,
                    reservedTicket: reservedTicket
                };

                const priceSpecification = <IReservationPriceSpecification>itemOffered.price;
                const unitPrice = (itemOffered.reservedTicket.ticketType.priceSpecification !== undefined)
                    ? itemOffered.reservedTicket.ticketType.priceSpecification.price
                    : 0;

                return {
                    typeOf: <factory.chevre.offerType>'Offer',
                    itemOffered: reservation,
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
                        typeOf: transaction.seller.typeOf,
                        name: transaction.seller.name.ja
                    }
                };
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = (error instanceof Error) ? { ...error, ...{ message: error.message } } : error;
                await actionRepo.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            try {
                // 仮予約があれば削除
                if (responseBody !== undefined) {
                    await reserveService.cancel({ id: responseBody.id });
                }

                // 車椅子レート制限解放
                await Promise.all(acceptedOffersWithSeatNumber.map(async (offer) => {
                    let ticketTypeCategory = TicketTypeCategory.Normal;
                    if (Array.isArray(offer.additionalProperty)) {
                        const categoryProperty = offer.additionalProperty.find((p) => p.name === 'category');
                        if (categoryProperty !== undefined) {
                            ticketTypeCategory = <TicketTypeCategory>categoryProperty.value;
                        }
                    }

                    if (ticketTypeCategory === TicketTypeCategory.Wheelchair) {
                        const rateLimitKey = {
                            performanceStartDate: performanceStartDate,
                            ticketTypeCategory: ticketTypeCategory,
                            unitInSeconds: WHEEL_CHAIR_RATE_LIMIT_UNIT_IN_SECONDS
                        };
                        const holder = await ticketTypeCategoryRateLimitRepo.getHolder(rateLimitKey);
                        if (holder === transaction.id) {
                            debug('resetting wheelchair rate limit...');
                            await ticketTypeCategoryRateLimitRepo.unlock(rateLimitKey);
                            debug('wheelchair rate limit reset.');
                        }
                    }
                }));
            } catch (error) {
                // no op
                // 失敗したら仕方ない
            }

            throw error;
        }

        const amount = acceptedOffers4result.reduce(
            (a, b) => {
                return a + (<IReservationPriceSpecification>b.priceSpecification).priceComponent.reduce((a2, b2) => a2 + b2.price, 0);
            },
            0
        );

        // アクションを完了
        const result: factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre> = {
            point: 0,
            price: amount,
            priceCurrency: factory.priceCurrency.JPY,
            // tmpReservations: tmpReservations, // 必要ないことが確実になったら削除
            requestBody: requestBody,
            responseBody: responseBody,
            ...(acceptedOffers4result !== undefined) ? { acceptedOffers: acceptedOffers4result } : undefined
        };

        return <Promise<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>>>
            actionRepo.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 座席予約承認アクションをキャンセルする
 */
export function cancel(params: {
    project: factory.project.IProject;
    /**
     * 承認アクションID
     */
    id: string;
    /**
     * 取引進行者
     */
    agent: { id: string };
    /**
     * 取引
     */
    transaction: { id: string };
}): ICancelOpetaiton<void> {
    return async (
        transactionRepo: TransactionRepo,
        actionRepo: ActionRepo,
        ticketTypeCategoryRateLimitRepo: TicketTypeCategoryRateLimitRepo,
        projectRepo: ProjectRepo
    ) => {
        try {
            const project = await projectRepo.findById({ id: params.project.id });
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.chevre === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            const transaction = await transactionRepo.findInProgressById({
                typeOf: factory.transactionType.PlaceOrder,
                id: params.transaction.id
            });

            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }

            // アクションではcompleteステータスであるにも関わらず、在庫は有になっている、というのが最悪の状況
            // それだけは回避するためにアクションを先に変更
            const action = <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>>
                await actionRepo.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
            const actionResult = <factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>
                action.result;

            const performance = action.object.event;
            if (performance !== undefined && performance !== null) {
                // 在庫から仮予約削除
                debug('removing tmp reservations...');
                const reserveService = new chevre.service.transaction.Reserve({
                    endpoint: project.settings.chevre.endpoint,
                    auth: chevreAuthClient
                });

                await reserveService.cancel({ id: (<any>actionResult).responseBody.id });

                // レート制限があれば解除
                const performanceStartDate = moment(performance.startDate)
                    .toDate();
                if (Array.isArray(actionResult.acceptedOffers)) {
                    await Promise.all(actionResult.acceptedOffers.map(async (acceptedOffer) => {
                        const reservation = acceptedOffer.itemOffered;

                        let ticketTypeCategory = TicketTypeCategory.Normal;
                        if (Array.isArray(reservation.reservedTicket.ticketType.additionalProperty)) {
                            const categoryProperty = reservation.reservedTicket.ticketType.additionalProperty.find((p) => p.name === 'category');
                            if (categoryProperty !== undefined) {
                                ticketTypeCategory = <TicketTypeCategory>categoryProperty.value;
                            }
                        }

                        if (ticketTypeCategory === TicketTypeCategory.Wheelchair) {
                            const rateLimitKey = {
                                performanceStartDate: performanceStartDate,
                                ticketTypeCategory: ticketTypeCategory,
                                unitInSeconds: WHEEL_CHAIR_RATE_LIMIT_UNIT_IN_SECONDS
                            };
                            const holder = await ticketTypeCategoryRateLimitRepo.getHolder(rateLimitKey);
                            if (holder === transaction.id) {
                                debug('resetting wheelchair rate limit...');
                                await ticketTypeCategoryRateLimitRepo.unlock(rateLimitKey);
                                debug('wheelchair rate limit reset.');
                            }
                        }
                    }));
                }
            }
        } catch (error) {
            // no op
        }
    };
}
