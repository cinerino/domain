import * as createDebug from 'debug';

import { MongoRepository as EventRepo } from '../repo/event';
import { MongoRepository as OrganizationRepo } from '../repo/organization';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import * as StockService from './stock';

const debug = createDebug('cinerino-domain:service');

type ISearchScreeningEventOffersOperation<T> = (repos: {
    event: EventRepo;
    eventService: chevre.service.Event;
}) => Promise<T>;
type ISearchScreeningEventTicketOffersOperation<T> = (repos: {
    event: EventRepo;
    organization: OrganizationRepo;
    eventService: chevre.service.Event;
}) => Promise<T>;

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

        if (event.suppliedThrough === undefined) {
            event.suppliedThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (event.suppliedThrough.identifier) {
            case factory.service.webAPI.Identifier.COA:
                let coaInfo: any;
                if (Array.isArray(event.additionalProperty)) {
                    const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                    coaInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
                }

                // イベント提供者がCOAであればCOAへ空席状況確認
                const stateReserveSeatResult = await COA.services.reserve.stateReserveSeat(coaInfo);

                const movieTheater = StockService.createMovieTheaterFromCOA(
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
                return repos.eventService.searchScreeningEventOffers({ eventId: params.event.id });
        }
    };
}

/**
 * 上映イベントに対する券種オファーを検索する
 */
export function searchScreeningEventTicketOffers(params: {
    event: { id: string };
    seller: { typeOf: factory.organizationType; id: string };
    store?: { id: string };
}): ISearchScreeningEventTicketOffersOperation<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    return async (repos: {
        event: EventRepo;
        organization: OrganizationRepo;
        eventService: chevre.service.Event;
    }) => {
        debug('searching screeninf event offers...', params);
        const event = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.event.id
        });

        let offers: factory.chevre.event.screeningEvent.ITicketOffer[];

        if (event.suppliedThrough === undefined) {
            event.suppliedThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (event.suppliedThrough.identifier) {
            case factory.service.webAPI.Identifier.COA:
                let coaInfo: any;
                if (Array.isArray(event.additionalProperty)) {
                    const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                    coaInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
                }

                offers = await searchTicketOffersFromCOA({
                    isMember: false,
                    event: event,
                    coaInfo: coaInfo
                });

                break;

            default:
                // Chevreで券種オファーを検索
                offers = await repos.eventService.searchScreeningEventTicketOffers({ eventId: params.event.id });

                // 店舗条件によって対象を絞る
                if (params.seller.typeOf !== factory.organizationType.MovieTheater) {
                    throw new factory.errors.Argument('seller', `Seller type ${params.seller.typeOf} not acceptable`);
                }
                const seller = await repos.organization.findById({ typeOf: params.seller.typeOf, id: params.seller.id });
                debug('seller.areaServed is', seller.areaServed);

                const specifiedStore = params.store;
                if (specifiedStore !== undefined && Array.isArray(seller.areaServed)) {
                    // 店舗指定がある場合、販売者の対応店舗を確認
                    const store = seller.areaServed.find((area) => area.id === specifiedStore.id);
                    debug('store is', store);
                    // 販売者の店舗に登録されていなければNotFound
                    if (store === undefined) {
                        throw new factory.errors.NotFound('Seller');
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

async function searchTicketOffersFromCOA(params: {
    isMember: boolean;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    coaInfo: any;
}): Promise<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    const offers: factory.chevre.event.screeningEvent.ITicketOffer[] = [];

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

    // 利用可能でないチケットコードが供給情報に含まれていれば引数エラー
    // 供給情報ごとに確認
    // tslint:disable-next-line:max-func-body-length
    availableSalesTickets.forEach((availableSalesTicket) => {
        const coaInfo: any = {
            ticketCode: availableSalesTicket.ticketCode,
            ticketName: availableSalesTicket.ticketName,
            ticketNameEng: availableSalesTicket.ticketNameEng,
            ticketNameKana: availableSalesTicket.ticketNameKana,
            stdPrice: availableSalesTicket.stdPrice,
            addPrice: availableSalesTicket.addPrice,
            disPrice: 0,
            salePrice: availableSalesTicket.salePrice,
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

        const offer: factory.chevre.event.screeningEvent.ITicketOffer = {
            typeOf: 'Offer',
            priceCurrency: factory.priceCurrency.JPY,
            id: availableSalesTicket.ticketCode,
            name: {
                ja: availableSalesTicket.ticketName,
                en: availableSalesTicket.ticketNameEng
            },
            description: {
                ja: availableSalesTicket.ticketName,
                en: availableSalesTicket.ticketNameEng
            },
            priceSpecification: {
                typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                valueAddedTaxIncluded: true,
                priceCurrency: factory.chevre.priceCurrency.JPY,
                priceComponent: [
                    {
                        typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
                        price: availableSalesTicket.salePrice,
                        priceCurrency: factory.chevre.priceCurrency.JPY,
                        valueAddedTaxIncluded: true,
                        referenceQuantity: {
                            typeOf: 'QuantitativeValue',
                            unitCode: factory.chevre.unitCode.C62,
                            value: 1
                        }
                        // appliesToMovieTicketType?: string;
                    }

                ]
            },
            availability: factory.chevre.itemAvailability.InStock,
            availabilityEnds: new Date(),
            availabilityStarts: new Date(),
            eligibleQuantity: {
                typeOf: 'QuantitativeValue',
                unitCode: factory.chevre.unitCode.C62,
                value: 1
            },
            validFrom: new Date(),
            validThrough: new Date(),
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
        const includeGlasses = (availableSalesTicket.addGlasses > 0);
        if (includeGlasses) {
            // offer.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
            // offer.ticketInfo.salePrice += availableSalesTicket.addGlasses;
            // offer.ticketInfo.addGlasses = availableSalesTicket.addGlasses;
        }

        offers.push(offer);
    });

    return offers;
}
