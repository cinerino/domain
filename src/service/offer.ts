import * as createDebug from 'debug';

import { MongoRepository as EventRepo } from '../repo/event';
import { IEvent as IEventCapacity, RedisRepository as EventAttendeeCapacityRepo } from '../repo/event/attendeeCapacity';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as SellerRepo } from '../repo/seller';

import * as MoneyTransferOfferService from './offer/moneyTransfer';

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import * as MasterSync from './masterSync';

const debug = createDebug('cinerino-domain:service');

export import moneyTransfer = MoneyTransferOfferService;

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ISearchEventsOperation<T> = (repos: {
    event: EventRepo;
    attendeeCapacity?: EventAttendeeCapacityRepo;
    project: ProjectRepo;
}) => Promise<T>;

export type ISearchEventOffersOperation<T> = (repos: {
    event: EventRepo;
    project: ProjectRepo;
}) => Promise<T>;

export type ISearchEventTicketOffersOperation<T> = (repos: {
    event: EventRepo;
    project: ProjectRepo;
    seller: SellerRepo;
}) => Promise<T>;

export type IEventOperation4cinemasunshine<T> = (repos: {
    event: EventRepo;
    attendeeCapacity?: EventAttendeeCapacityRepo;
}) => Promise<T>;

export interface ISearchEventsResult {
    data: factory.event.screeningEvent.IEvent[];
    totalCount: number;
}

/**
 * 残席数情報も含めてイベントを検索する
 */
export function searchEvents(params: {
    project: factory.project.IProject;
    conditions: factory.event.screeningEvent.ISearchConditions;
}): ISearchEventsOperation<ISearchEventsResult> {
    return async (repos: {
        event: EventRepo;
        attendeeCapacity?: EventAttendeeCapacityRepo;
        project: ProjectRepo;
    }) => {
        let data: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>[];
        let totalCount: number;

        const project = await repos.project.findById({ id: params.project.id });
        const useEventRepo = project.settings !== undefined && project.settings.useEventRepo === true;

        if (useEventRepo) {
            data = await repos.event.search<factory.chevre.eventType.ScreeningEvent>(params.conditions);

            let capacities: IEventCapacity[] = [];
            if (repos.attendeeCapacity !== undefined) {
                const eventIds = data.map((e) => e.id);
                capacities = await repos.attendeeCapacity.findByEventIds(eventIds);
            }

            data = data.map((e) => {
                const capacity = capacities.find((c) => c.id === e.id);

                return {
                    ...e,
                    ...capacity
                };
            });

            totalCount = await repos.event.count(params.conditions);
        } else {
            if (project.settings === undefined || project.settings.chevre === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const eventService = new chevre.service.Event({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            const searchEventsResult = await eventService.search<factory.chevre.eventType.ScreeningEvent>({
                ...params.conditions,
                project: { ids: [project.id] }
            });
            data = searchEventsResult.data;
            totalCount = searchEventsResult.totalCount;
        }

        return {
            data: data,
            totalCount: totalCount
        };
    };
}

/**
 * イベントに対する座席オファーを検索する
 */
// tslint:disable-next-line:max-func-body-length
export function searchEventOffers(params: {
    project: factory.project.IProject;
    event: { id: string };
}): ISearchEventOffersOperation<factory.chevre.event.screeningEvent.IScreeningRoomSectionOffer[]> {
    return async (repos: {
        event: EventRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        const useEventRepo = project.settings !== undefined && project.settings.useEventRepo === true;

        let event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
        if (useEventRepo) {
            event = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
                id: params.event.id
            });
        } else {
            if (project.settings === undefined || project.settings.chevre === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const eventService = new chevre.service.Event({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
                id: params.event.id
            });
        }

        const eventOffers = event.offers;
        if (eventOffers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        if (eventOffers.offeredThrough === undefined) {
            eventOffers.offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (eventOffers.offeredThrough.identifier) {
            case factory.service.webAPI.Identifier.COA:
                let coaInfo: any;
                if (Array.isArray(event.additionalProperty)) {
                    const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                    coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                }

                // イベント提供者がCOAであればCOAへ空席状況確認
                const stateReserveSeatResult = await COA.services.reserve.stateReserveSeat(coaInfo);

                const movieTheater = MasterSync.createMovieTheaterFromCOA(
                    params.project,
                    await COA.services.master.theater(coaInfo),
                    await COA.services.master.screen(coaInfo)
                );
                const screeningRoom = <chevre.factory.place.movieTheater.IScreeningRoom>movieTheater.containsPlace.find(
                    (p) => p.branchCode === event.location.branchCode
                );
                if (screeningRoom === undefined) {
                    throw new chevre.factory.errors.NotFound('Screening room');
                }
                const screeningRoomSections = screeningRoom.containsPlace;
                const offers: chevre.factory.event.screeningEvent.IScreeningRoomSectionOffer[] = screeningRoomSections;
                offers.forEach((offer) => {
                    const seats = offer.containsPlace;
                    const seatSection = offer.branchCode;
                    seats.forEach((seat) => {
                        const seatNumber = seat.branchCode;
                        const availableOffer = stateReserveSeatResult.listSeat.find(
                            (result) => result.seatSection === seatSection
                                && result.listFreeSeat.find((freeSeat) => freeSeat.seatNum === seatNumber) !== undefined
                        );
                        seat.offers = [{
                            typeOf: 'Offer',
                            priceCurrency: chevre.factory.priceCurrency.JPY,
                            availability: (availableOffer !== undefined)
                                ? chevre.factory.itemAvailability.InStock
                                : chevre.factory.itemAvailability.OutOfStock
                        }];
                    });
                });

                return screeningRoomSections;

            default:
                if (project.settings === undefined || project.settings.chevre === undefined) {
                    throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
                }

                const eventService = new chevre.service.Event({
                    endpoint: project.settings.chevre.endpoint,
                    auth: chevreAuthClient
                });

                // 基本的にはCHEVREへ空席確認
                return eventService.searchOffers({ id: params.event.id });
        }
    };
}

export type IAcceptedPaymentMethod = factory.paymentMethod.paymentCard.movieTicket.IMovieTicket;

/**
 * イベントに対する券種オファーを検索する
 */
export function searchEventTicketOffers(params: {
    project: factory.project.IProject;
    /**
     * どのイベントに対して
     */
    event: { id: string };
    /**
     * どの販売者に対して
     */
    seller: { typeOf: factory.organizationType; id: string };
    /**
     * どの店舗に対して
     */
    store?: { id: string };
    /**
     * どの決済方法に対して
     */
    paymentMethod?: IAcceptedPaymentMethod;
}): ISearchEventTicketOffersOperation<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        project: ProjectRepo;
        seller: SellerRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined || project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const useEventRepo = project.settings !== undefined && project.settings.useEventRepo === true;

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const offerService = new chevre.service.Offer({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        debug('searching screeninf event offers...', params);
        let event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
        if (useEventRepo) {
            event = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
                id: params.event.id
            });
        } else {
            event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
                id: params.event.id
            });
        }

        let offers: factory.chevre.event.screeningEvent.ITicketOffer[];
        const eventOffers = event.offers;
        if (eventOffers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        if (eventOffers.offeredThrough === undefined) {
            eventOffers.offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (eventOffers.offeredThrough.identifier) {
            case factory.service.webAPI.Identifier.COA:
                let coaInfo: factory.event.screeningEvent.ICOAInfo | undefined;
                if (Array.isArray(event.additionalProperty)) {
                    const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                    coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                }

                let superEventCOAInfo: factory.event.screeningEventSeries.ICOAInfo | undefined;
                if (Array.isArray(event.superEvent.additionalProperty)) {
                    const coaInfoProperty = event.superEvent.additionalProperty.find((p) => p.name === 'coaInfo');
                    superEventCOAInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                }

                if (coaInfo === undefined || superEventCOAInfo === undefined) {
                    throw new factory.errors.NotFound('Event COA Info');
                }

                const theaterCode = coaInfo.theaterCode;

                // COA販売可能券種検索
                const salesTickets = await COA.services.reserve.salesTicket({
                    ...coaInfo,
                    flgMember: COA.services.reserve.FlgMember.Member
                });

                const searchOffersResult = await offerService.searchTicketTypes({
                    limit: 100,
                    project: { ids: [params.project.id] },
                    ids: salesTickets.map((t) => `COA-${theaterCode}-${t.ticketCode}`)
                });

                // ChevreオファーにCOA券種情報を付加して返却
                offers = salesTickets.map((t) => {
                    const offer = searchOffersResult.data.find((o) => o.id === `COA-${theaterCode}-${t.ticketCode}`);
                    if (offer === undefined) {
                        throw new factory.errors.NotFound(`Offer: COA-${theaterCode}-${t.ticketCode}`);
                    }

                    if (!Array.isArray(offer.additionalProperty)) {
                        offer.additionalProperty = [];
                    }

                    // coaInfoを調整する
                    let offerCoaInfo: any = {};
                    const coaInfoStrProperty = offer.additionalProperty.find((p) => p.name === 'coaInfo');
                    if (coaInfoStrProperty !== undefined) {
                        offerCoaInfo = JSON.parse(coaInfoStrProperty.value);
                    }

                    offer.additionalProperty = offer.additionalProperty.filter((p) => p.name !== 'coaInfo');
                    offer.additionalProperty.push({ name: 'coaInfo', value: JSON.stringify({ ...offerCoaInfo, ...t }) });

                    return {
                        ...offer,
                        ...coaSalesTicket2offer({
                            project: params.project,
                            event: event,
                            salesTicket: t,
                            coaInfo: <factory.event.screeningEvent.ICOAInfo>coaInfo,
                            superEventCOAInfo: <factory.event.screeningEventSeries.ICOAInfo>superEventCOAInfo
                        })
                    };
                });

                break;

            default:
                // Chevreで券種オファーを検索
                offers = await eventService.searchTicketOffers({ id: params.event.id });

                // 店舗条件によって対象を絞る
                if (params.seller.typeOf !== factory.organizationType.MovieTheater) {
                    throw new factory.errors.Argument('seller', `Seller type ${params.seller.typeOf} not acceptable`);
                }
                const seller = await repos.seller.findById({ id: params.seller.id });
                debug('seller.areaServed is', seller.areaServed);

                const specifiedStore = params.store;
                if (specifiedStore !== undefined && Array.isArray(seller.areaServed)) {
                    // 店舗指定がある場合、販売者の対応店舗を確認
                    const store = seller.areaServed.find((area) => area.id === specifiedStore.id);
                    debug('store is', store);
                    // 販売者の店舗に登録されていなければNotFound
                    if (store === undefined) {
                        throw new factory.errors.NotFound('Store', 'Store not found in a seller\'s served area');
                    }

                    // 店舗タイプによって、利用可能なオファーを絞る
                    const availabilityAccepted: factory.chevre.itemAvailability[] = [factory.chevre.itemAvailability.InStock];
                    switch (store.typeOf) {
                        case factory.placeType.Online:
                            availabilityAccepted.push(factory.chevre.itemAvailability.OnlineOnly);
                            break;
                        case factory.placeType.Store:
                            availabilityAccepted.push(factory.chevre.itemAvailability.InStoreOnly);
                            break;
                        default:
                    }
                    offers = offers.filter((o) => availabilityAccepted.indexOf(<factory.chevre.itemAvailability>o.availability) >= 0);
                }
        }

        return offers;
    };
}

/**
 * COA販売券種をオファーへ変換する
 * COAの券種インターフェースをchevreのチケットオファーインターフェースへ変換します
 */
// tslint:disable-next-line:max-func-body-length
function coaSalesTicket2offer(params: {
    project: factory.project.IProject;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    salesTicket: COA.services.reserve.ISalesTicketResult;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
    superEventCOAInfo: factory.event.screeningEventSeries.ICOAInfo;
}): factory.chevre.event.screeningEvent.ITicketOffer {
    // const coaInfo: factory.event.screeningEvent.ICOAOffer = {
    //     ticketCode: params.salesTicket.ticketCode,
    //     ticketName: params.salesTicket.ticketName,
    //     ticketNameEng: params.salesTicket.ticketNameEng,
    //     ticketNameKana: params.salesTicket.ticketNameKana,
    //     stdPrice: params.salesTicket.stdPrice,
    //     addPrice: params.salesTicket.addPrice,
    //     disPrice: 0,
    //     salePrice: params.salesTicket.salePrice,
    //     addGlasses: 0,
    //     mvtkAppPrice: 0,
    //     ticketCount: 1,
    //     seatNum: '',
    //     kbnEisyahousiki: '00', // ムビチケを使用しない場合の初期値をセット
    //     mvtkNum: '', // ムビチケを使用しない場合の初期値をセット
    //     mvtkKbnDenshiken: '00', // ムビチケを使用しない場合の初期値をセット
    //     mvtkKbnMaeuriken: '00', // ムビチケを使用しない場合の初期値をセット
    //     mvtkKbnKensyu: '00', // ムビチケを使用しない場合の初期値をセット
    //     mvtkSalesPrice: 0, // ムビチケを使用しない場合の初期値をセット
    //     usePoint: 0
    // };

    const priceSpecification: factory.chevre.event.screeningEvent.ITicketPriceSpecification
        = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
        valueAddedTaxIncluded: true,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        priceComponent: []
    };

    // 人数制限仕様を単価仕様へ変換
    const unitPriceSpec: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>
        = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
        price: params.salesTicket.stdPrice,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        valueAddedTaxIncluded: true,
        referenceQuantity: {
            typeOf: 'QuantitativeValue',
            unitCode: factory.chevre.unitCode.C62
            // value: 1
        }
        // appliesToMovieTicketType?: string;
    };

    switch (params.salesTicket.limitUnit) {
        case '001':
            unitPriceSpec.referenceQuantity.value = params.salesTicket.limitCount;
            unitPriceSpec.price = params.salesTicket.limitCount * params.salesTicket.stdPrice;
            break;
        case '002':
            unitPriceSpec.referenceQuantity.minValue = params.salesTicket.limitCount;
            break;
        default:
            unitPriceSpec.referenceQuantity.value = 1;
    }

    priceSpecification.priceComponent.push(unitPriceSpec);

    // 加算単価を上映方式チャージ仕様へ変換
    // if (params.coaInfo.kbnAcoustic !== undefined) {
    //     switch (params.coaInfo.kbnAcoustic.kubunCode) {
    //         default:
    //     }
    // }

    // 映像区分変換
    // if (params.superEventCOAInfo.kbnEizou !== undefined) {
    //     switch (params.superEventCOAInfo.kbnEizou.kubunCode) {
    //         case '002':
    //             priceSpecification.priceComponent.push({
    //                 typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
    //                 price: params.superEventCOAInfo.kbnEizou.kubunAddPrice,
    //                 priceCurrency: factory.chevre.priceCurrency.JPY,
    //                 valueAddedTaxIncluded: true,
    //                 appliesToVideoFormat: factory.chevre.videoFormatType['3D']
    //             });

    //             break;

    //         default:
    //     }
    // }

    // 上映方式区分変換
    // if (params.superEventCOAInfo.kbnJoueihousiki !== undefined) {
    //     switch (params.superEventCOAInfo.kbnJoueihousiki.kubunCode) {
    //         case '001':
    //             priceSpecification.priceComponent.push({
    //                 typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
    //                 price: params.superEventCOAInfo.kbnJoueihousiki.kubunAddPrice,
    //                 priceCurrency: factory.chevre.priceCurrency.JPY,
    //                 valueAddedTaxIncluded: true,
    //                 appliesToVideoFormat: factory.chevre.videoFormatType.IMAX
    //             });

    //             break;

    //         case '002':
    //             priceSpecification.priceComponent.push({
    //                 typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
    //                 price: params.superEventCOAInfo.kbnJoueihousiki.kubunAddPrice,
    //                 priceCurrency: factory.chevre.priceCurrency.JPY,
    //                 valueAddedTaxIncluded: true,
    //                 appliesToVideoFormat: factory.chevre.videoFormatType['4DX']
    //             });

    //             break;

    //         default:
    //     }
    // }

    // tslint:disable-next-line:no-suspicious-comment
    // TODO メガネ単価を変換

    const eventOffers = params.event.offers;
    if (eventOffers === undefined) {
        throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
    }

    // メガネ代込みの要求の場合は、販売単価調整&メガネ代をセット
    // const includeGlasses = (params.salesTicket.addGlasses > 0);
    // if (includeGlasses) {
    //     offer.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
    //     offer.ticketInfo.salePrice += availableSalesTicket.addGlasses;
    //     offer.ticketInfo.addGlasses = availableSalesTicket.addGlasses;
    // }

    return {
        typeOf: 'Offer',
        priceCurrency: factory.priceCurrency.JPY,
        id: `COA-${params.coaInfo.theaterCode}-${params.salesTicket.ticketCode}`,
        identifier: params.salesTicket.ticketCode,
        name: {
            ja: params.salesTicket.ticketName,
            en: params.salesTicket.ticketNameEng
        },
        description: {
            ja: params.salesTicket.ticketNote,
            en: ''
        },
        priceSpecification: priceSpecification,
        availability: factory.chevre.itemAvailability.InStock,
        availabilityStarts: eventOffers.availabilityStarts,
        availabilityEnds: eventOffers.availabilityEnds,
        validThrough: eventOffers.validThrough,
        validFrom: eventOffers.validFrom,
        eligibleQuantity: {
            typeOf: 'QuantitativeValue',
            unitCode: factory.chevre.unitCode.C62,
            value: 1
        },
        itemOffered: {
            serviceType: {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: 'ServiceType',
                id: '',
                identifier: '',
                name: ''
            }
        }
    };
}

/**
 * 個々のイベントを検索する
 * 在庫状況リポジトリをパラメーターとして渡せば、在庫状況も取得してくれる
 */
export function searchEvents4cinemasunshine(
    searchConditions: factory.event.screeningEvent.ISearchConditions
): IEventOperation4cinemasunshine<factory.event.screeningEvent.IEvent[]> {
    return async (repos: {
        event: EventRepo;
        attendeeCapacity?: EventAttendeeCapacityRepo;
    }) => {
        debug('finding screeningEvents...', searchConditions);
        const events = await repos.event.search<factory.chevre.eventType.ScreeningEvent>(searchConditions);

        let capacities: IEventCapacity[] = [];
        if (repos.attendeeCapacity !== undefined) {
            const eventIds = events.map((e) => e.id);
            capacities = await repos.attendeeCapacity.findByEventIds(eventIds);
        }

        return events.map((e) => {
            const capacity = capacities.find((c) => c.id === e.id);

            // シネマサンシャインではavailability属性を利用しているため、残席数から空席率情報を追加
            const offers = (e.offers !== undefined)
                ? {
                    ...e.offers,
                    // tslint:disable-next-line:no-magic-numbers
                    availability: (e.offers !== undefined && e.offers.availability !== undefined) ? e.offers.availability : 100
                }
                : undefined;

            if (offers !== undefined
                && capacity !== undefined
                && capacity.remainingAttendeeCapacity !== undefined
                && e.maximumAttendeeCapacity !== undefined) {
                // tslint:disable-next-line:no-magic-numbers
                offers.availability = Math.floor(Number(capacity.remainingAttendeeCapacity) / Number(e.maximumAttendeeCapacity) * 100);
            }

            return {
                ...e,
                ...capacity,
                ...(offers !== undefined)
                    ? {
                        offer: offers, // 本来不要だが、互換性維持のため
                        offers: offers
                    }
                    : undefined
            };
        });
    };
}

/**
 * 個々のイベントを識別子で取得する
 */
export function findEventById4cinemasunshine(
    id: string
): IEventOperation4cinemasunshine<factory.event.screeningEvent.IEvent> {
    return async (repos: {
        event: EventRepo;
        attendeeCapacity?: EventAttendeeCapacityRepo;
    }) => {
        const event = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
            id: id
        });

        let capacities: IEventCapacity[] = [];
        if (repos.attendeeCapacity !== undefined) {
            const eventIds = [event.id];
            capacities = await repos.attendeeCapacity.findByEventIds(eventIds);
        }

        const capacity = capacities.find((c) => c.id === event.id);

        // シネマサンシャインではavailability属性を利用しているため、残席数から空席率情報を追加
        const offers = (event.offers !== undefined)
            ? {
                ...event.offers,
                availability: 100
            }
            : undefined;

        if (offers !== undefined
            && capacity !== undefined
            && capacity.remainingAttendeeCapacity !== undefined
            && event.maximumAttendeeCapacity !== undefined) {
            // tslint:disable-next-line:no-magic-numbers
            offers.availability = Math.floor(Number(capacity.remainingAttendeeCapacity) / Number(event.maximumAttendeeCapacity) * 100);
        }

        return {
            ...event,
            ...capacity,
            ...(offers !== undefined)
                ? {
                    offer: offers, // 本来不要だが、互換性維持のため
                    offers: offers
                }
                : undefined
        };
    };
}
