import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import { MongoRepository as EventRepo } from '../repo/event';
import { IEvent as IEventCapacity, RedisRepository as EventAttendeeCapacityRepo } from '../repo/event/attendeeCapacity';
import { RedisRepository as ScreeningEventItemAvailabilityRepo } from '../repo/itemAvailability/screeningEvent';
import { MongoRepository as SellerRepo } from '../repo/seller';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import * as MasterSync from './masterSync';

const debug = createDebug('cinerino-domain:service');

export type ISearchScreeningEventOffersOperation<T> = (repos: {
    event: EventRepo;
    eventService: chevre.service.Event;
}) => Promise<T>;

export type ISearchScreeningEventTicketOffersOperation<T> = (repos: {
    event: EventRepo;
    seller: SellerRepo;
    eventService: chevre.service.Event;
}) => Promise<T>;

export type IEventOperation4cinemasunshine<T> = (repos: {
    event: EventRepo;
    itemAvailability?: ScreeningEventItemAvailabilityRepo;
    attendeeCapacity?: EventAttendeeCapacityRepo;
}) => Promise<T>;

export type IUpdateItemAvailabilityOperation<T> = (repos: { itemAvailability: ScreeningEventItemAvailabilityRepo }) => Promise<T>;

/**
 * 上映イベントに対する座席オファーを検索する
 */
export function searchScreeningEventOffers(params: {
    event: { id: string };
}): ISearchScreeningEventOffersOperation<factory.chevre.event.screeningEvent.IScreeningRoomSectionOffer[]> {
    return async (repos: {
        event: EventRepo;
        eventService: chevre.service.Event;
    }) => {
        const event = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.event.id
        });
        const eventOffers = event.offers;

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
                // 基本的にはCHEVREへ空席確認
                return repos.eventService.searchOffers({ id: params.event.id });
        }
    };
}

export type IAcceptedPaymentMethod = factory.paymentMethod.paymentCard.movieTicket.IMovieTicket;

/**
 * 上映イベントに対する券種オファーを検索する
 */
export function searchScreeningEventTicketOffers(params: {
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
}): ISearchScreeningEventTicketOffersOperation<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    return async (repos: {
        event: EventRepo;
        seller: SellerRepo;
        eventService: chevre.service.Event;
    }) => {
        debug('searching screeninf event offers...', params);
        const event = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.event.id
        });

        let offers: factory.chevre.event.screeningEvent.ITicketOffer[];
        const eventOffers = event.offers;

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

                offers = await searchTicketOffersFromCOA({
                    isMember: false,
                    event: event,
                    coaInfo: coaInfo,
                    superEventCOAInfo: superEventCOAInfo
                });

                break;

            default:
                // Chevreで券種オファーを検索
                offers = await repos.eventService.searchTicketOffers({ id: params.event.id });

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
                    offers = offers.filter((o) => availabilityAccepted.indexOf(o.availability) >= 0);
                }
        }

        return offers;
    };
}

// tslint:disable-next-line:max-func-body-length
async function searchTicketOffersFromCOA(params: {
    isMember: boolean;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
    superEventCOAInfo: factory.event.screeningEventSeries.ICOAInfo;
}): Promise<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    const offers: factory.chevre.event.screeningEvent.ITicketOffer[] = [];
    const eventOffers = params.event.offers;

    // 供給情報が適切かどうか確認
    const availableSalesTickets: COA.services.reserve.ISalesTicketResult[] = [];

    // COA券種取得(非会員)
    const salesTickets4nonMember = await COA.services.reserve.salesTicket(params.coaInfo);
    availableSalesTickets.push(...salesTickets4nonMember);

    // COA券種取得(会員)
    // if (isMember) {
    //     const salesTickets4member = await COA.services.reserve.salesTicket({
    //         ...coaInfo,
    //         flgMember: COA.services.reserve.FlgMember.Member
    //     });
    //     availableSalesTickets.push(...salesTickets4member);
    // }

    debug('availableSalesTickets:', availableSalesTickets);

    // COA券種をオファーへ変換
    availableSalesTickets.forEach((availableSalesTicket) => {
        const offer: factory.chevre.event.screeningEvent.ITicketOffer = coaSalesTicket2offer({
            event: params.event,
            salesTicket: availableSalesTicket,
            coaInfo: params.coaInfo,
            superEventCOAInfo: params.superEventCOAInfo
        });

        offers.push(offer);
    });

    // ムビチケ決済が許可されていればムビチケオファーを恣意的に追加
    const movieTicketPaymentAccepted = eventOffers.acceptedPaymentMethod === undefined
        || eventOffers.acceptedPaymentMethod.indexOf(factory.paymentMethodType.MovieTicket) >= 0;
    if (movieTicketPaymentAccepted) {
        const mvtkOffer: factory.chevre.event.screeningEvent.ITicketOffer = {
            typeOf: 'Offer',
            id: 'offer-by-movieTicket',
            name: { ja: 'ムビチケ', en: 'Movie Ticket' },
            description: { ja: '', en: '' },
            availability: factory.chevre.itemAvailability.InStock,
            availabilityStarts: eventOffers.availabilityStarts,
            availabilityEnds: eventOffers.availabilityEnds,
            validThrough: eventOffers.validThrough,
            validFrom: eventOffers.validFrom,
            priceCurrency: factory.chevre.priceCurrency.JPY,
            priceSpecification: {
                typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                valueAddedTaxIncluded: true,
                priceCurrency: factory.chevre.priceCurrency.JPY,
                priceComponent: [
                    {
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
                        typeOf: factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification,
                        price: 0,
                        priceCurrency: factory.chevre.priceCurrency.JPY,
                        valueAddedTaxIncluded: true,
                        appliesToVideoFormat: factory.chevre.videoFormatType['2D'],
                        appliesToMovieTicketType: ''
                    }
                ]
            },
            eligibleQuantity: {
                typeOf: 'QuantitativeValue',
                unitCode: factory.chevre.unitCode.C62,
                value: 1
            },
            itemOffered: eventOffers.itemOffered
        };

        offers.push(mvtkOffer);
    }

    return offers;
}

/**
 * COA販売券種をオファーへ変換する
 * COAの券種インターフェースをchevreのチケットオファーインターフェースへ変換します
 */
// tslint:disable-next-line:max-func-body-length
function coaSalesTicket2offer(params: {
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    salesTicket: COA.services.reserve.ISalesTicketResult;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
    superEventCOAInfo: factory.event.screeningEventSeries.ICOAInfo;
}): factory.chevre.event.screeningEvent.ITicketOffer {
    const coaInfo: factory.event.screeningEvent.ICOAOffer = {
        ticketCode: params.salesTicket.ticketCode,
        ticketName: params.salesTicket.ticketName,
        ticketNameEng: params.salesTicket.ticketNameEng,
        ticketNameKana: params.salesTicket.ticketNameKana,
        stdPrice: params.salesTicket.stdPrice,
        addPrice: params.salesTicket.addPrice,
        disPrice: 0,
        salePrice: params.salesTicket.salePrice,
        addGlasses: 0,
        mvtkAppPrice: 0,
        ticketCount: 1,
        seatNum: '',
        kbnEisyahousiki: '00', // ムビチケを使用しない場合の初期値をセット
        mvtkNum: '', // ムビチケを使用しない場合の初期値をセット
        mvtkKbnDenshiken: '00', // ムビチケを使用しない場合の初期値をセット
        mvtkKbnMaeuriken: '00', // ムビチケを使用しない場合の初期値をセット
        mvtkKbnKensyu: '00', // ムビチケを使用しない場合の初期値をセット
        mvtkSalesPrice: 0, // ムビチケを使用しない場合の初期値をセット
        usePoint: 0
    };

    const priceSpecification: factory.chevre.event.screeningEvent.ITicketPriceSpecification
        = {
        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
        valueAddedTaxIncluded: true,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        priceComponent: []
    };

    // 人数制限仕様を単価仕様へ変換
    const unitPriceSpec: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>
        = {
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
    if (params.coaInfo.kbnAcoustic !== undefined) {
        switch (params.coaInfo.kbnAcoustic.kubunCode) {
            default:
        }
    }

    // 映像区分変換
    if (params.superEventCOAInfo.kbnEizou !== undefined) {
        switch (params.superEventCOAInfo.kbnEizou.kubunCode) {
            case '002':
                priceSpecification.priceComponent.push({
                    typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
                    price: params.superEventCOAInfo.kbnEizou.kubunAddPrice,
                    priceCurrency: factory.chevre.priceCurrency.JPY,
                    valueAddedTaxIncluded: true,
                    appliesToVideoFormat: factory.chevre.videoFormatType['3D']
                });

                break;

            default:
        }
    }

    // 上映方式区分変換
    if (params.superEventCOAInfo.kbnJoueihousiki !== undefined) {
        switch (params.superEventCOAInfo.kbnJoueihousiki.kubunCode) {
            case '001':
                priceSpecification.priceComponent.push({
                    typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
                    price: params.superEventCOAInfo.kbnJoueihousiki.kubunAddPrice,
                    priceCurrency: factory.chevre.priceCurrency.JPY,
                    valueAddedTaxIncluded: true,
                    appliesToVideoFormat: factory.chevre.videoFormatType.IMAX
                });

                break;

            case '002':
                priceSpecification.priceComponent.push({
                    typeOf: factory.chevre.priceSpecificationType.VideoFormatChargeSpecification,
                    price: params.superEventCOAInfo.kbnJoueihousiki.kubunAddPrice,
                    priceCurrency: factory.chevre.priceCurrency.JPY,
                    valueAddedTaxIncluded: true,
                    appliesToVideoFormat: factory.chevre.videoFormatType['4DX']
                });

                break;

            default:
        }
    }

    // tslint:disable-next-line:no-suspicious-comment
    // TODO メガネ単価を変換

    const eventOffers = params.event.offers;
    const offer: factory.chevre.event.screeningEvent.ITicketOffer = {
        typeOf: 'Offer',
        priceCurrency: factory.priceCurrency.JPY,
        id: params.salesTicket.ticketCode,
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
                typeOf: 'ServiceType',
                id: '',
                name: ''
            }
        },
        additionalProperty: [{
            name: 'coaInfo',
            value: coaInfo
        }]
    };

    // メガネ代込みの要求の場合は、販売単価調整&メガネ代をセット
    const includeGlasses = (params.salesTicket.addGlasses > 0);
    if (includeGlasses) {
        // offer.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
        // offer.ticketInfo.salePrice += availableSalesTicket.addGlasses;
        // offer.ticketInfo.addGlasses = availableSalesTicket.addGlasses;
    }

    return offer;
}

/**
 * 個々の上映イベントを検索する
 * 在庫状況リポジトリをパラメーターとして渡せば、在庫状況も取得してくれる
 */
export function searchScreeningEvents4cinemasunshine(
    searchConditions: factory.event.screeningEvent.ISearchConditions
): IEventOperation4cinemasunshine<factory.event.screeningEvent.IEvent[]> {
    return async (repos: {
        event: EventRepo;
        itemAvailability?: ScreeningEventItemAvailabilityRepo;
        attendeeCapacity?: EventAttendeeCapacityRepo;
    }) => {
        debug('finding screeningEvents...', searchConditions);
        let events = await repos.event.searchScreeningEvents(searchConditions);

        events = await Promise.all(events.map(async (event) => {
            // 必ず定義されている前提
            const coaInfo = <factory.event.screeningEvent.ICOAInfo>event.coaInfo;

            // 空席状況情報を追加
            const offers = {
                ...event.offers,
                availability: <any>null // 互換性維持のためnull
            };

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (repos.itemAvailability !== undefined) {
                // nullになりうるが、互換性維持のため、あえてそのまま
                offers.availability = <number>await repos.itemAvailability.findOne(coaInfo.dateJouei, event.identifier);
            }

            return {
                ...event,
                offer: offers, //  本来不要だが、互換性維持のため
                offers: offers
            };
        }));

        let capacities: IEventCapacity[] = [];
        if (repos.attendeeCapacity !== undefined) {
            const eventIds = events.map((e) => e.id);
            capacities = await repos.attendeeCapacity.findByEventIds(eventIds);
        }

        return events.map((e) => {
            const capacity = capacities.find((c) => c.id === e.id);

            return {
                ...e,
                ...capacity
            };
        });
    };
}

/**
 * 個々の上映イベントを識別子で取得する
 */
export function findScreeningEventById4cinemasunshine(
    id: string
): IEventOperation4cinemasunshine<factory.event.screeningEvent.IEvent> {
    return async (repos: {
        event: EventRepo;
        itemAvailability?: ScreeningEventItemAvailabilityRepo;
        attendeeCapacity?: EventAttendeeCapacityRepo;
    }) => {
        const event = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: id
        });

        // 必ず定義されている前提
        const coaInfo = <factory.event.screeningEvent.ICOAInfo>event.coaInfo;

        // add item availability info
        const offer = {
            ...event.offers,
            availability: <any>null // 互換性維持のためnull
        };

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (repos.itemAvailability !== undefined) {
            offer.availability = <number>await repos.itemAvailability.findOne(coaInfo.dateJouei, event.identifier);
        }

        return {
            ...event,
            offer: offer, //  本来不要だが、互換性維持のため
            offers: offer
        };
    };
}

/**
 * 劇場IDと上映日範囲から上映イベント在庫状況を更新する
 */
export function updateScreeningEventItemAvailability(locationBranchCode: string, startFrom: Date, startThrough: Date):
    IUpdateItemAvailabilityOperation<void> {
    return async (repos: { itemAvailability: ScreeningEventItemAvailabilityRepo }) => {
        // COAから空席状況取得
        const countFreeSeatResult = await COA.services.reserve.countFreeSeat({
            theaterCode: locationBranchCode,
            begin: moment(startFrom)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD'), // COAは日本時間で判断
            end: moment(startThrough)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD') // COAは日本時間で判断
        });

        // 上映日ごとに
        await Promise.all(countFreeSeatResult.listDate.map(async (countFreeSeatDate) => {
            debug('saving screeningEvent item availability... day:', countFreeSeatDate.dateJouei);
            // 上映イベントごとに空席状況を生成して保管
            await Promise.all(
                countFreeSeatDate.listPerformance.map(async (countFreeSeatPerformance) => {
                    const eventId = MasterSync.createScreeningEventIdFromCOA({
                        theaterCode: countFreeSeatResult.theaterCode,
                        titleCode: countFreeSeatPerformance.titleCode,
                        titleBranchNum: countFreeSeatPerformance.titleBranchNum,
                        dateJouei: countFreeSeatDate.dateJouei,
                        screenCode: countFreeSeatPerformance.screenCode,
                        timeBegin: countFreeSeatPerformance.timeBegin
                    });

                    const itemAvailability = createItemAvailability(
                        // COAからのレスポンスが負の値の場合があるので調整
                        Math.max(0, countFreeSeatPerformance.cntReserveFree),
                        Math.max(0, countFreeSeatPerformance.cntReserveMax)
                    );

                    // 永続化
                    debug('saving item availability... identifier:', eventId);
                    await repos.itemAvailability.updateOne(
                        countFreeSeatDate.dateJouei,
                        eventId,
                        itemAvailability
                    );
                    debug('item availability saved');
                })
            );
        }));
    };
}

/**
 * 座席数から在庫状況表現を生成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createItemAvailability(
    numberOfAvailableSeats: number, numberOfAllSeats: number
): number {
    if (numberOfAllSeats === 0) {
        return 0;
    }

    // 残席数より空席率を算出
    // tslint:disable-next-line:no-magic-numbers
    return Math.floor(numberOfAvailableSeats / numberOfAllSeats * 100);
}
