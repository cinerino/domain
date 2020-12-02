import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as COA from '../../coa';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleChevreError, handleCOAReserveTemporarilyError } from '../../errorHandler';

import * as OfferService from '../../service/offer';
import {
    acceptedOffers2amount,
    createAuthorizeSeatReservationActionAttributes,
    createReserveTransactionStartParams,
    responseBody2acceptedOffers4result
} from './seatReservation/factory';

const debug = createDebug('cinerino-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

const WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS = 6;

enum SeatingType {
    Normal = 'Normal',
    Wheelchair = 'Wheelchair'
}

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type ISelectSeatOperation<T> = () => Promise<T>;

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type IMovieTicketTypeChargeSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification>;
export type IAcceptedOfferWithoutDetail4chevre = factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail4chevre;

/**
 * 座席予約承認
 */
export function create(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    agent: { id: string };
    transaction: { id: string };
    autoSeatSelection?: boolean;
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>> {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

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

        const eventService = new chevre.service.Event({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
            id: params.object.event.id
        });

        let offeredThrough = event.offers?.offeredThrough;
        if (offeredThrough === undefined) {
            offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }
        const bookingServiceIdentifier = offeredThrough.identifier;

        if (bookingServiceIdentifier === factory.service.webAPI.Identifier.Chevre
            && params.autoSeatSelection === true) {
            // 座席自動選択
            params.object.acceptedOffer = await selectSeats(
                project,
                event,
                params.object.acceptedOffer,
                params.transaction.id
            )();
        }

        const acceptedOffers = await validateAcceptedOffers({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            object: params.object,
            event: event,
            seller: { typeOf: transaction.seller.typeOf, id: String(transaction.seller.id) }
        })(repos);

        let requestBody: factory.action.authorize.offer.seatReservation.IRequestBody<typeof offeredThrough.identifier>;
        let responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<typeof offeredThrough.identifier>;
        let reserveService: COA.service.Reserve | chevre.service.transaction.Reserve | undefined;
        let acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] = [];
        let transactionNumber: string | undefined;

        switch (bookingServiceIdentifier) {
            case factory.service.webAPI.Identifier.COA:
                break;

            case factory.service.webAPI.Identifier.Chevre:
                // Chevre予約の場合、まず取引番号発行
                const transactionNumberService = new chevre.service.TransactionNumber({
                    endpoint: credentials.chevre.endpoint,
                    auth: chevreAuthClient
                });
                const publishResult = await transactionNumberService.publish({
                    project: { id: project.id }
                });
                transactionNumber = publishResult.transactionNumber;

                break;

            default:
        }

        // 承認アクションを開始
        const actionAttributes = createAuthorizeSeatReservationActionAttributes({
            acceptedOffers: acceptedOffers,
            event: event,
            pendingTransaction: <any>{
                transactionNumber: transactionNumber
            },
            transaction: transaction
        });
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        try {
            switch (bookingServiceIdentifier) {
                case factory.service.webAPI.Identifier.COA:
                    let coaInfo: any;
                    if (Array.isArray(event.additionalProperty)) {
                        // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                    }

                    // COAにて仮予約
                    reserveService = new COA.service.Reserve(
                        {
                            endpoint: credentials.coa.endpoint,
                            auth: coaAuthClient
                        },
                        { timeout: COA_TIMEOUT }
                    );

                    requestBody = {
                        theaterCode: coaInfo.theaterCode,
                        dateJouei: coaInfo.dateJouei,
                        titleCode: coaInfo.titleCode,
                        titleBranchNum: coaInfo.titleBranchNum,
                        timeBegin: coaInfo.timeBegin,
                        screenCode: coaInfo.screenCode,
                        listSeat: params.object.acceptedOffer.map((offer) => {
                            return {
                                seatSection: ((<any>offer).ticketedSeat !== undefined) ? (<any>offer).ticketedSeat.seatSection : '',
                                seatNum: ((<any>offer).ticketedSeat !== undefined) ? (<any>offer).ticketedSeat.seatNumber : ''
                            };
                        })
                    };

                    responseBody = await reserveService.updTmpReserveSeat(requestBody);

                    break;

                case factory.service.webAPI.Identifier.Chevre:
                    if (typeof transactionNumber !== 'string') {
                        // 論理的にありえないフロー
                        throw new factory.errors.ServiceUnavailable('Unexpected error occurred: reserve transactionNumber not found');
                    }

                    reserveService = new chevre.service.transaction.Reserve({
                        endpoint: credentials.chevre.endpoint,
                        auth: chevreAuthClient
                    });

                    // Chevreで仮予約
                    const startParams = createReserveTransactionStartParams({
                        project: project,
                        object: params.object,
                        transaction: transaction,
                        transactionNumber: transactionNumber
                    });
                    requestBody = startParams;
                    responseBody = await reserveService.start(startParams);

                    // 座席仮予約からオファー情報を生成する
                    acceptedOffers4result = responseBody2acceptedOffers4result({
                        responseBody: responseBody,
                        event: event,
                        project: params.project,
                        seller: transaction.seller
                    });

                    break;

                default:
                    throw new factory.errors.Argument('Event', `Unknown booking service '${bookingServiceIdentifier}'`);
            }
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            switch (bookingServiceIdentifier) {
                case factory.service.webAPI.Identifier.COA:
                    error = handleCOAReserveTemporarilyError(error);
                    break;

                case factory.service.webAPI.Identifier.Chevre:
                    error = handleChevreError(error);
                    break;

                default:
            }

            throw error;
        }

        // 金額計算
        const amount = acceptedOffers2amount({ acceptedOffers: acceptedOffers4result });

        // アクションを完了
        const result: factory.action.authorize.offer.seatReservation.IResult<typeof offeredThrough.identifier> = {
            price: amount,
            priceCurrency: acceptedOffers[0].priceCurrency,
            amount: [],
            requestBody: requestBody,
            responseBody: responseBody,
            ...(acceptedOffers4result !== undefined) ? { acceptedOffers: acceptedOffers4result } : undefined
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * tttsのacceptedOfferパラメータ(座席指定なし)に対して
 * 座席指定情報を付加(座席の自動選択)
 * addditionalTicketTextを付加
 * する
 */
// tslint:disable-next-line:max-func-body-length
export function selectSeats(
    __: factory.project.IProject,
    performance: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>,
    acceptedOffer: IAcceptedOfferWithoutDetail4chevre[],
    transactionId: string
): ISelectSeatOperation<IAcceptedOfferWithoutDetail4chevre[]> {
    return async () => {
        const acceptedOffersWithoutDetail: IAcceptedOfferWithoutDetail4chevre[] = [];

        const eventService = new chevre.service.Event({
            endpoint: credentials.chevre.endpoint,
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
                    typeOf: p.typeOf,
                    branchCode: p.branchCode,
                    seatingType: p.seatingType
                };
            });
            let availableSeatsForAdditionalStocks = sectionOffer.containsPlace.map((p) => {
                return {
                    typeOf: p.typeOf,
                    branchCode: p.branchCode,
                    seatingType: p.seatingType
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
                    (s) => (typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Wheelchair)
                        || (Array.isArray(s.seatingType) && s.seatingType.includes(<string>SeatingType.Wheelchair))
                );

                // 余分確保は一般座席から
                availableSeatsForAdditionalStocks = availableSeatsForAdditionalStocks.filter(
                    (s) => (typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Normal)
                        || (Array.isArray(s.seatingType) && s.seatingType.includes(<string>SeatingType.Normal))
                );

                // 車椅子確保分が一般座席になければ車椅子は0
                if (availableSeatsForAdditionalStocks.length < WHEEL_CHAIR_NUM_ADDITIONAL_STOCKS) {
                    availableSeats = [];
                }
            } else {
                availableSeats = availableSeats.filter(
                    (s) => (typeof s.seatingType === 'string' && s.seatingType === <string>SeatingType.Normal)
                        || (Array.isArray(s.seatingType) && s.seatingType.includes(<string>SeatingType.Normal))
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

            const additionalProperty: factory.propertyValue.IPropertyValue<string>[] = [
                ...(Array.isArray(ticketOffer.additionalProperty))
                    ? ticketOffer.additionalProperty
                    : [],
                { name: 'transaction', value: transactionId }
            ];

            const additionalTicketText = offer.itemOffered?.serviceOutput?.additionalTicketText;

            acceptedOffersWithoutDetail.push({
                additionalProperty: offer.additionalProperty,
                id: <string>ticketOffer.id,
                itemOffered: {
                    serviceOutput: {
                        typeOf: factory.chevre.reservationType.EventReservation,
                        additionalTicketText: additionalTicketText,
                        reservedTicket: {
                            typeOf: 'Ticket',
                            ticketedSeat: {
                                seatSection: sectionOffer.branchCode,
                                seatNumber: selectedSeat.branchCode,
                                seatRow: '',
                                seatingType: selectedSeat.seatingType,
                                typeOf: selectedSeat.typeOf
                            }
                        },
                        additionalProperty: additionalProperty,
                        // 余分確保分
                        subReservation: (selectedSeatsForAdditionalStocks.length > 0)
                            ? selectedSeatsForAdditionalStocks.map((selectedSeatForAdditionalStocks) => {
                                return {
                                    reservedTicket: {
                                        typeOf: 'Ticket',
                                        ticketedSeat: {
                                            seatSection: sectionOffer.branchCode,
                                            seatNumber: selectedSeatForAdditionalStocks.branchCode,
                                            seatRow: '',
                                            typeOf: selectedSeatForAdditionalStocks.typeOf
                                        }
                                    }
                                };
                            })
                            : undefined
                    }
                }
            });
        }

        return acceptedOffersWithoutDetail;
    };
}

/**
 * 受け入れらたオファーの内容を検証
 */
export function validateAcceptedOffers(params: {
    project: factory.chevre.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    seller: { typeOf: factory.chevre.organizationType; id: string };
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        project: ProjectRepo;
    }): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre>[]> => {
        const masterService = new COA.service.Master(
            {
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            },
            { timeout: COA_TIMEOUT }
        );

        // 利用可能なチケットオファーを検索
        const availableTicketOffers = <factory.chevre.event.screeningEvent.ITicketOffer[]>await OfferService.searchEventTicketOffers({
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            event: { id: params.event.id },
            seller: params.seller
        })(repos);

        // 座席オファーを検索
        const availableSeatOffers = await OfferService.searchEventOffers({
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            event: { id: params.event.id }
        })(repos);

        const acceptedOffersWithoutDetail = params.object.acceptedOffer;

        // 利用可能なチケットオファーであれば受け入れる
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        const acceptedOffers = await Promise.all(acceptedOffersWithoutDetail.map(async (offerWithoutDetail) => {
            const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
            }

            // 座席指定であれば、座席タイプチャージを検索する
            let seatPriceComponent: factory.chevre.place.seat.IPriceComponent[] | undefined;
            let ticketedSeat = (<any>offerWithoutDetail).ticketedSeat; // 互換性維持対応
            if (offerWithoutDetail.itemOffered !== undefined && offerWithoutDetail.itemOffered !== null) {
                if (offerWithoutDetail.itemOffered.serviceOutput !== undefined && offerWithoutDetail.itemOffered.serviceOutput !== null) {
                    if (offerWithoutDetail.itemOffered.serviceOutput.reservedTicket !== undefined
                        && offerWithoutDetail.itemOffered.serviceOutput.reservedTicket !== null) {
                        if (offerWithoutDetail.itemOffered.serviceOutput.reservedTicket.ticketedSeat !== undefined
                            && offerWithoutDetail.itemOffered.serviceOutput.reservedTicket.ticketedSeat !== null) {
                            ticketedSeat = offerWithoutDetail.itemOffered.serviceOutput.reservedTicket.ticketedSeat;
                        }
                    }
                }

            }
            if (ticketedSeat !== undefined && ticketedSeat !== null) {
                const seatSection = ticketedSeat.seatSection;
                const seatNumber = ticketedSeat.seatNumber;

                const availableSeatSectionOffer = availableSeatOffers.find((o) => o.branchCode === seatSection);
                if (availableSeatSectionOffer !== undefined) {
                    if (Array.isArray(availableSeatSectionOffer.containsPlace)) {
                        const availableSeat =
                            availableSeatSectionOffer.containsPlace.find((o) => o.branchCode === seatNumber);
                        if (availableSeat !== undefined) {
                            if (Array.isArray(availableSeat.offers)) {
                                if (availableSeat.offers[0] !== undefined) {
                                    const availableSeatOffer = availableSeat.offers[0];
                                    if (availableSeatOffer !== undefined) {
                                        if (availableSeatOffer.priceSpecification !== undefined
                                            && availableSeatOffer.priceSpecification !== null
                                            && Array.isArray(availableSeatOffer.priceSpecification.priceComponent)) {
                                            seatPriceComponent = availableSeatOffer.priceSpecification.priceComponent;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            const acceptedOffer: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre> = {
                ...offerWithoutDetail,
                ...offer,
                itemOffered: {
                    serviceType: offer.itemOffered.serviceType,
                    serviceOutput: (offerWithoutDetail.itemOffered !== undefined && offerWithoutDetail.itemOffered !== null)
                        ? offerWithoutDetail.itemOffered.serviceOutput
                        : undefined
                },
                addOn: (Array.isArray(offerWithoutDetail.addOn))
                    ? offerWithoutDetail.addOn.map((a) => {
                        return {
                            project: params.project,
                            typeOf: factory.chevre.offerType.Offer,
                            id: a.id,
                            priceCurrency: offer.priceCurrency
                        };
                    })
                    : [],
                priceSpecification: {
                    // イベントオファーと座席オファーの価格要素をマージ
                    ...offer.priceSpecification,
                    priceComponent: [
                        ...offer.priceSpecification.priceComponent,
                        ...(Array.isArray(seatPriceComponent)) ? seatPriceComponent : []
                    ]
                },
                // 追加属性をマージ
                additionalProperty: [
                    ...(Array.isArray(offerWithoutDetail.additionalProperty)) ? offerWithoutDetail.additionalProperty : [],
                    ...(Array.isArray(offer.additionalProperty)) ? offer.additionalProperty : []
                ]
            };

            const offers = params.event.offers;
            if (offers === undefined) {
                throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
            }

            let offeredThrough = offers.offeredThrough;
            if (offeredThrough === undefined) {
                offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }

            switch (offeredThrough.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    let coaInfo: factory.event.screeningEvent.ICOAOffer;

                    // 制限単位がn人単位(例えば夫婦割り)の場合、同一券種の数を確認
                    // '001'の値は、区分マスター取得APIにて、"kubunCode": "011"を指定すると取得できる
                    // if (availableSalesTicket.limitUnit === '001') {
                    // }

                    // tslint:disable-next-line:max-line-length
                    const mvtkChargeSpec = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification>>
                        acceptedOffer.priceSpecification.priceComponent.find(
                            (component) => component.typeOf === factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification
                        );

                    // ムビチケオファーの場合
                    if (mvtkChargeSpec !== undefined) {
                        // ムビチケ情報指定が必須
                        const movieTicket = offerWithoutDetail.paymentMethod;
                        if (movieTicket === undefined) {
                            throw new factory.errors.Argument('Offer', 'Movie Ticket not specified');
                        }
                        if (movieTicket.identifier === undefined) {
                            throw new factory.errors.Argument('Offer', 'Movie Ticket identifier not specified');
                        }
                        if (movieTicket.accessCode === undefined) {
                            throw new factory.errors.Argument('Offer', 'Movie Ticket accessCode not specified');
                        }

                        const sellerService = new chevre.service.Seller({
                            endpoint: credentials.chevre.endpoint,
                            auth: chevreAuthClient
                        });
                        const seller = await sellerService.findById({ id: params.seller.id });
                        const paymentAccepted = seller.paymentAccepted?.some((a) => a.paymentMethodType === movieTicket.typeOf);
                        if (paymentAccepted !== true) {
                            throw new factory.errors.Argument('transactionId', 'payment not accepted');
                        }

                        // ムビチケ認証
                        const payService = new chevre.service.transaction.Pay({
                            endpoint: credentials.chevre.endpoint,
                            auth: chevreAuthClient
                        });
                        const checkAction = await payService.check({
                            project: { id: params.project.id, typeOf: chevre.factory.organizationType.Project },
                            typeOf: chevre.factory.actionType.CheckAction,
                            agent: { id: params.project.id, typeOf: chevre.factory.organizationType.Project },
                            object: [{
                                typeOf: chevre.factory.service.paymentService.PaymentServiceType.MovieTicket,
                                paymentMethod: {
                                    typeOf: movieTicket.typeOf,
                                    additionalProperty: [],
                                    name: movieTicket.typeOf,
                                    paymentMethodId: '' // 使用されないので空でよし
                                },
                                movieTickets: [{
                                    project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
                                    typeOf: movieTicket.typeOf,
                                    identifier: movieTicket.identifier,
                                    accessCode: movieTicket.accessCode,
                                    serviceType: '',
                                    serviceOutput: {
                                        reservationFor: { id: params.event.id, typeOf: params.event.typeOf },
                                        reservedTicket: {
                                            ticketedSeat: {
                                                typeOf: chevre.factory.placeType.Seat,
                                                // seatingType?: ISeatingType;
                                                seatNumber: ticketedSeat.seatNumber,
                                                seatRow: '',
                                                seatSection: ticketedSeat.seatSection
                                            }
                                        }
                                    }
                                }],
                                seller: params.seller
                            }]
                        });
                        const checkResult = checkAction.result;

                        if (checkResult?.movieTickets.length === 0) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }
                        if (checkResult?.purchaseNumberAuthResult.knyknrNoInfoOut === null) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }
                        if (checkResult?.purchaseNumberAuthResult.knyknrNoInfoOut[0].ykknInfo === null) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }

                        const purchaseNumberInfo = checkResult?.purchaseNumberAuthResult.knyknrNoInfoOut[0];
                        const valieMovieTicketInfo = checkResult?.purchaseNumberAuthResult.knyknrNoInfoOut[0].ykknInfo[0];
                        if (purchaseNumberInfo === undefined) {
                            throw new factory.errors.Argument('Offer', 'purchaseNumberAuthResult.knyknrNoInfoOut[0] undefined');
                        }
                        if (valieMovieTicketInfo === undefined) {
                            throw new factory.errors.Argument('Offer', 'purchaseNumberAuthResult.knyknrNoInfoOut[0].ykknInfo[0] undefined');
                        }

                        let eventCOAInfo: any;
                        if (Array.isArray(params.event.additionalProperty)) {
                            const coaInfoProperty = params.event.additionalProperty.find((p) => p.name === 'coaInfo');
                            eventCOAInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                        }

                        // ムビチケ認証結果を使ってCOA券種に変換
                        let mvtkTicketCodeIn: COA.factory.master.IMvtkTicketcodeArgs;
                        let availableSalesTicket: COA.factory.master.IMvtkTicketcodeResult;
                        try {
                            mvtkTicketCodeIn = {
                                theaterCode: eventCOAInfo.theaterCode,
                                kbnDenshiken: purchaseNumberInfo.dnshKmTyp,
                                kbnMaeuriken: purchaseNumberInfo.znkkkytsknGkjknTyp,
                                kbnKensyu: valieMovieTicketInfo.ykknshTyp,
                                salesPrice: Number(valieMovieTicketInfo.knshknhmbiUnip),
                                appPrice: Number(valieMovieTicketInfo.kijUnip),
                                kbnEisyahousiki: valieMovieTicketInfo.eishhshkTyp,
                                titleCode: eventCOAInfo.titleCode,
                                titleBranchNum: eventCOAInfo.titleBranchNum,
                                dateJouei: eventCOAInfo.dateJouei
                            };
                            availableSalesTicket = await masterService.mvtkTicketcode(mvtkTicketCodeIn);
                        } catch (error) {
                            // COAサービスエラーの場合ハンドリング
                            if (error.name === 'COAServiceError') {
                                // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
                                // 500未満であればクライアントエラーとみなす
                                // tslint:disable-next-line:no-single-line-block-comment
                                /* istanbul ignore else */
                                if (error.code < INTERNAL_SERVER_ERROR) {
                                    throw new factory.errors.NotFound(
                                        `Offers`,
                                        `Movie Ticket ${movieTicket.identifier} unavailable`
                                    );
                                }
                            }

                            throw error;
                        }

                        // const offerWithDetails: factory.action.authorize.offer.seatReservation.IAcceptedOffer = {
                        //     typeOf: 'Offer',
                        //     price: offer.ticketInfo.mvtkSalesPrice + availableSalesTicket.addPrice,
                        //     priceCurrency: factory.priceCurrency.JPY,
                        //     seatNumber: offer.seatNumber,
                        //     seatSection: offer.seatSection,
                        //     ticketInfo: {
                        //     }
                        // };

                        coaInfo = {
                            ticketCode: availableSalesTicket.ticketCode,
                            ticketName: availableSalesTicket.ticketName,
                            ticketNameEng: availableSalesTicket.ticketNameEng,
                            ticketNameKana: availableSalesTicket.ticketNameKana,
                            stdPrice: 0,
                            addPrice: availableSalesTicket.addPrice,
                            disPrice: 0,
                            salePrice: availableSalesTicket.addPrice,
                            spseatAdd1: 0,
                            spseatAdd2: 0,
                            spseatKbn: '',
                            addGlasses: 0, // まずメガネ代金なしでデータをセット
                            mvtkAppPrice: mvtkTicketCodeIn.appPrice,
                            ticketCount: 1,
                            seatNum: ((<any>acceptedOffer).ticketedSeat !== undefined) ? (<any>acceptedOffer).ticketedSeat.seatNumber : '',
                            kbnEisyahousiki: mvtkTicketCodeIn.kbnEisyahousiki,
                            mvtkNum: movieTicket.identifier,
                            mvtkKbnDenshiken: mvtkTicketCodeIn.kbnDenshiken,
                            mvtkKbnMaeuriken: mvtkTicketCodeIn.kbnMaeuriken,
                            mvtkKbnKensyu: mvtkTicketCodeIn.kbnKensyu,
                            mvtkSalesPrice: mvtkTicketCodeIn.salesPrice,
                            kbnMgtk: '',
                            usePoint: 0
                        };

                        // ムビチケ情報が確定して初めて価格仕様が決定する
                        acceptedOffer.priceSpecification.priceComponent = [
                            {
                                project: params.project,
                                typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
                                price: 0,
                                priceCurrency: factory.chevre.priceCurrency.JPY,
                                valueAddedTaxIncluded: true,
                                referenceQuantity: {
                                    typeOf: 'QuantitativeValue',
                                    unitCode: factory.chevre.unitCode.C62,
                                    value: 1
                                }
                            },
                            {
                                project: params.project,
                                typeOf: factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification,
                                price: 0,
                                priceCurrency: factory.chevre.priceCurrency.JPY,
                                valueAddedTaxIncluded: true,
                                appliesToVideoFormat: '2D',
                                appliesToMovieTicket: {
                                    typeOf: factory.chevre.service.paymentService.PaymentServiceType.MovieTicket,
                                    serviceType: mvtkTicketCodeIn.kbnKensyu,
                                    serviceOutput: { typeOf: factory.chevre.paymentMethodType.MovieTicket }
                                },
                                ...{
                                    // 互換性維持対応
                                    appliesToMovieTicketType: mvtkTicketCodeIn.kbnKensyu
                                }
                            }
                        ];

                        // メガネ代込みの要求の場合は、販売単価調整&メガネ代をセット
                        // const includeGlasses = (offer.ticketInfo.addGlasses > 0);
                        // if (includeGlasses) {
                        //     offerWithDetails.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
                        //     offerWithDetails.price += availableSalesTicket.addPriceGlasses;
                        //     offerWithDetails.ticketInfo.salePrice += availableSalesTicket.addPriceGlasses;
                        //     offerWithDetails.ticketInfo.addGlasses = availableSalesTicket.addPriceGlasses;
                        // }
                    } else {
                        const coaInfoProperty = acceptedOffer.additionalProperty.find((p) => p.name === 'coaInfo');
                        if (coaInfoProperty === undefined) {
                            throw new factory.errors.NotFound('Offer coaInfo');
                        }

                        coaInfo = {
                            ...JSON.parse(coaInfoProperty.value),
                            disPrice: 0,
                            addGlasses: 0,
                            mvtkAppPrice: 0,
                            ticketCount: 1,
                            seatNum: ((<any>acceptedOffer).ticketedSeat !== undefined) ? (<any>acceptedOffer).ticketedSeat.seatNumber : '',
                            kbnEisyahousiki: '00', // ムビチケを使用しない場合の初期値をセット
                            mvtkNum: '', // ムビチケを使用しない場合の初期値をセット
                            mvtkKbnDenshiken: '00', // ムビチケを使用しない場合の初期値をセット
                            mvtkKbnMaeuriken: '00', // ムビチケを使用しない場合の初期値をセット
                            mvtkKbnKensyu: '00', // ムビチケを使用しない場合の初期値をセット
                            mvtkSalesPrice: 0, // ムビチケを使用しない場合の初期値をセット
                            usePoint: 0
                        };

                        // メガネ代込みの要求の場合は、販売単価調整&メガネ代をセット
                        // const includeGlasses = (offer.ticketInfo.addGlasses > 0);
                        // if (includeGlasses) {
                        //     coaInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
                        //     acceptedOffer.price += availableSalesTicket.addGlasses;
                        //     coaInfo.salePrice += availableSalesTicket.addGlasses;
                        //     coaInfo.addGlasses = availableSalesTicket.addGlasses;
                        // }
                    }

                    // coaInfoプロパティを上書きする
                    acceptedOffer.additionalProperty = acceptedOffer.additionalProperty.filter((p) => p.name !== 'coaInfo');
                    acceptedOffer.additionalProperty.push({
                        name: 'coaInfo',
                        value: JSON.stringify(coaInfo)
                    });

                    break;

                default:
                // no op
            }

            return acceptedOffer;
        }));

        // オファーIDごとにオファー適用条件を確認
        const offerIds = [...new Set(acceptedOffers.map((o) => o.id))];
        offerIds.forEach((offerId) => {
            const acceptedOffersByOfferId = acceptedOffers.filter((o) => o.id === offerId);
            let referenceQuantityValue = 1;
            const unitPriceSpec = <IUnitPriceSpecification>acceptedOffersByOfferId[0].priceSpecification.priceComponent.find(
                (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
            );
            if (unitPriceSpec !== undefined && unitPriceSpec.referenceQuantity.value !== undefined) {
                referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
            }

            // アイテム数が適用単位要件を満たしていなければエラー
            if (acceptedOffersByOfferId.length % referenceQuantityValue !== 0) {
                throw new factory.errors.Argument(
                    'acceptedOffers',
                    `Offer ${offerId} requires reference quantity value ${referenceQuantityValue}`
                );
            }

            // 適用アイテム数要件を満たしていなければエラー
            if (unitPriceSpec.eligibleQuantity !== undefined) {
                const maxValue = unitPriceSpec.eligibleQuantity.maxValue;
                if (typeof maxValue === 'number') {
                    if (acceptedOffersByOfferId.length > maxValue) {
                        throw new factory.errors.Argument(
                            'acceptedOffers',
                            `Number of offer:${offerId} must be less than or equal to ${maxValue}`
                        );
                    }
                }

                const minValue = unitPriceSpec.eligibleQuantity.minValue;
                if (typeof minValue === 'number') {
                    if (acceptedOffersByOfferId.length < minValue) {
                        throw new factory.errors.Argument(
                            'acceptedOffers',
                            `Number of offer:${offerId} must be more than or equal to ${minValue}`
                        );
                    }
                }
            }
        });

        return acceptedOffers;
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
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }
        // MongoDBでcompleteステータスであるにも関わらず、Chevreでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>>
            await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

        if (action.instrument === undefined || action.instrument === null) {
            action.instrument = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (action.instrument.identifier) {
            case factory.service.webAPI.Identifier.COA:
                if (action.result !== undefined) {
                    const actionResult = action.result;
                    // tslint:disable-next-line:max-line-length
                    const responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>actionResult.responseBody;
                    const event = action.object.event;

                    let coaInfo: any;
                    if (event !== undefined && Array.isArray(event.additionalProperty)) {
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                    }

                    const coaReserveService = new COA.service.Reserve(
                        {
                            endpoint: credentials.coa.endpoint,
                            auth: coaAuthClient
                        },
                        { timeout: COA_TIMEOUT }
                    );

                    await coaReserveService.delTmpReserve({
                        ...coaInfo,
                        tmpReserveNum: responseBody.tmpReserveNum
                    });
                }

                break;

            default:
                const reserveService = new chevre.service.transaction.Reserve({
                    endpoint: credentials.chevre.endpoint,
                    auth: chevreAuthClient
                });

                if (typeof action.object.pendingTransaction?.transactionNumber === 'string') {
                    // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
                    await reserveService.cancel({ transactionNumber: action.object.pendingTransaction?.transactionNumber });
                }
        }
    };
}
