import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment-timezone';

import { MongoRepository as ProjectRepo } from '../repo/project';

import * as MonetaryAmountOfferService from './offer/monetaryAmount';
import * as ProductOfferService from './offer/product';
import * as ReservationOfferService from './offer/reservation';
import * as SeatReservationOfferService from './offer/seatReservation';
import * as SeatReservation4coaOfferService from './offer/seatReservation4coa';

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

const debug = createDebug('cinerino-domain:service');

export import monetaryAmount = MonetaryAmountOfferService;
export import product = ProductOfferService;
export import reservation = ReservationOfferService;
export import seatReservation = SeatReservationOfferService;
export import seatReservation4coa = SeatReservation4coaOfferService;

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

export type ISearchEventOffersOperation<T> = (repos: {
    project: ProjectRepo;
}) => Promise<T>;

export type ISearchEventTicketOffersOperation<T> = (repos: {
    project: ProjectRepo;
}) => Promise<T>;

export type IAcceptedPaymentMethod = factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket;

/**
 * イベントに対する券種オファーを検索する
 */
// tslint:disable-next-line:max-func-body-length
export function searchEventTicketOffers(params: {
    project: factory.project.IProject;
    /**
     * どのイベントに対して
     */
    event: { id: string };
    /**
     * どの販売者に対して
     */
    seller: { typeOf: factory.chevre.organizationType; id: string };
    /**
     * どの店舗に対して
     */
    store?: { id: string };
    /**
     * どの決済方法に対して
     */
    paymentMethod?: IAcceptedPaymentMethod;
    /**
     * COAムビチケ券種もほしい場合に指定
     */
    movieTicket?: {
        /**
         * 電子券区分
         */
        kbnDenshiken: string;
        /**
         * 前売券区分
         */
        kbnMaeuriken: string;
        /**
         * 券種区分
         */
        kbnKensyu: string;
        /**
         * 販売単価
         */
        salesPrice: number;
        /**
         * 計上単価
         */
        appPrice: number;
        /**
         * 映写方式区分
         */
        kbnEisyahousiki: string;
    };
}): ISearchEventTicketOffersOperation<factory.chevre.event.screeningEvent.ITicketOffer[] | IAvailableSalesTickets[]> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        project: ProjectRepo;
    }) => {
        const now = moment();

        const project = await repos.project.findById({ id: params.project.id });

        const eventService = new chevre.service.Event({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        debug('searching screeninf event offers...', params);
        let event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;

        event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({
            id: params.event.id
        });

        let offers: factory.chevre.event.screeningEvent.ITicketOffer[] | IAvailableSalesTickets[];
        const eventOffers = event.offers;
        if (eventOffers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        if (eventOffers.offeredThrough === undefined) {
            eventOffers.offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        switch (eventOffers.offeredThrough.identifier) {
            case factory.service.webAPI.Identifier.COA:
                offers = await searchCOAAvailableTickets({ event, project, movieTicket: params.movieTicket });

                break;

            default:
                // Chevreで券種オファーを検索
                offers = await eventService.searchTicketOffers({ id: params.event.id });

                const specifiedStoreId = params.store?.id;
                if (typeof specifiedStoreId === 'string') {
                    // アプリケーションが利用可能なオファーに絞る
                    offers = offers.filter((o) => {
                        return Array.isArray(o.availableAtOrFrom)
                            && o.availableAtOrFrom.some((availableApplication) => availableApplication.id === specifiedStoreId);
                    });
                }

                // 有効期間を適用
                offers = offers.filter((o) => {
                    let isvalid = true;

                    if (o.validFrom !== undefined && moment(o.validFrom)
                        .isAfter(now)) {
                        isvalid = false;
                    }
                    if (o.validThrough !== undefined && moment(o.validThrough)
                        .isBefore(now)) {
                        isvalid = false;
                    }

                    return isvalid;
                });

                // addOnsに対しても利用可能アプリケーション設定を適用
                if (typeof specifiedStoreId === 'string') {
                    for (const offer of offers) {
                        if (Array.isArray(offer.addOn)) {
                            // アプリケーションが利用可能なオファーに絞る
                            offer.addOn = offer.addOn.filter((offer4addOn) => {
                                return Array.isArray(offer4addOn.availableAtOrFrom)
                                    && offer4addOn.availableAtOrFrom.some(
                                        (availableApplication) => availableApplication.id === specifiedStoreId
                                    );
                            });
                        }
                    }
                }
        }

        return offers;
    };
}

export type IAvailableSalesTickets = COA.factory.reserve.ISalesTicketResult & {
    flgMember: COA.factory.reserve.FlgMember;
    /**
     * ポイント購入の場合の消費ポイント
     */
    usePoint: number;
    flgMvtk: boolean;
    /**
     * ムビチケ計上単価
     * ムビチケの場合、計上単価（興収報告単価）をセット（ムビチケ以外は0をセット）
     */
    mvtkAppPrice: number;
    /**
     * ムビチケ映写方式区分
     * ムビチケ連携情報より
     */
    kbnEisyahousiki: string;
    /**
     * ムビチケ電子券区分
     * ムビチケ連携情報より(01：電子、02：紙)
     * ※ムビチケ以外は"00"をセット
     */
    mvtkKbnDenshiken: string;
    /**
     * ムビチケ前売券区分
     * ムビチケ連携情報より(01：全国券、02：劇場券)
     * ※ムビチケ以外は"00"をセット
     */
    mvtkKbnMaeuriken: string;
    /**
     * ムビチケ券種区分
     * ムビチケ連携情報より(01：一般2Ｄ、02：小人2Ｄ、03：一般3Ｄ)
     * ※ムビチケ以外は"00"をセット
     */
    mvtkKbnKensyu: string;
    /**
     * ムビチケ販売単価
     * ムビチケ連携情報より（ムビチケ以外は0をセット）
     */
    mvtkSalesPrice: number;
};

/**
 * COAから利用可能な販売券種をすべて検索する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function searchCOAAvailableTickets(params: {
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    project: factory.project.IProject;
    movieTicket?: {
        /**
         * 電子券区分
         */
        kbnDenshiken: string;
        /**
         * 前売券区分
         */
        kbnMaeuriken: string;
        /**
         * 券種区分
         */
        kbnKensyu: string;
        /**
         * 販売単価
         */
        salesPrice: number;
        /**
         * 計上単価
         */
        appPrice: number;
        /**
         * 映写方式区分
         */
        kbnEisyahousiki: string;
    };
}): Promise<IAvailableSalesTickets[]> {
    const event = params.event;

    const reserveService = new COA.service.Reserve(
        {
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        },
        { timeout: COA_TIMEOUT }
    );
    const masterService = new COA.service.Master(
        {
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        },
        { timeout: COA_TIMEOUT }
    );

    // 供給情報が適切かどうか確認
    const availableSalesTickets: IAvailableSalesTickets[] = [];

    // 必ず定義されている前提
    const coaInfo = <factory.event.screeningEvent.ICOAInfo>event.coaInfo;

    try {

        // COA券種取得(非会員)
        const salesTickets4nonMember = await reserveService.salesTicket({
            theaterCode: coaInfo.theaterCode,
            dateJouei: coaInfo.dateJouei,
            titleCode: coaInfo.titleCode,
            titleBranchNum: coaInfo.titleBranchNum,
            timeBegin: coaInfo.timeBegin,
            flgMember: COA.factory.reserve.FlgMember.NonMember
        });
        availableSalesTickets.push(...salesTickets4nonMember.map((t) => {
            return {
                ...t,
                flgMember: COA.factory.reserve.FlgMember.NonMember,
                usePoint: 0,
                flgMvtk: false,
                mvtkAppPrice: 0,
                kbnEisyahousiki: '00',
                mvtkKbnDenshiken: '00',
                mvtkKbnMaeuriken: '00',
                mvtkKbnKensyu: '00',
                mvtkSalesPrice: 0
            };
        }));

        // COA券種取得(会員)
        const salesTickets4member = await reserveService.salesTicket({
            theaterCode: coaInfo.theaterCode,
            dateJouei: coaInfo.dateJouei,
            titleCode: coaInfo.titleCode,
            titleBranchNum: coaInfo.titleBranchNum,
            timeBegin: coaInfo.timeBegin,
            flgMember: COA.factory.reserve.FlgMember.Member
        });

        // ポイント消費鑑賞券の場合
        // COA側のマスタ構成で、
        // 券種マスタに消費ポイント
        // 販売可能チケット情報に販売金額
        // を持っているので、処理が少し冗長になってしまうが、しょうがない
        const allTickets = await masterService.ticket({
            theaterCode: coaInfo.theaterCode
        });

        let coaPointTicket: COA.factory.master.ITicketResult | undefined;
        salesTickets4member.forEach((salesTicket) => {
            coaPointTicket = allTickets.find((t) => t.ticketCode === salesTicket.ticketCode);

            availableSalesTickets.push({
                ...salesTicket,
                flgMember: COA.factory.reserve.FlgMember.Member,
                usePoint: (coaPointTicket !== undefined) ? Number(coaPointTicket.usePoint) : 0,
                flgMvtk: false,
                mvtkAppPrice: 0,
                kbnEisyahousiki: '00',
                mvtkKbnDenshiken: '00',
                mvtkKbnMaeuriken: '00',
                mvtkKbnKensyu: '00',
                mvtkSalesPrice: 0
            });
        });

        // ムビチケの場合、ムビチケ情報をCOA券種に変換
        if (params.movieTicket !== undefined) {
            const mvtkTicketcodeResult = await masterService.mvtkTicketcode({
                theaterCode: coaInfo.theaterCode,
                kbnDenshiken: params.movieTicket.kbnDenshiken,
                kbnMaeuriken: params.movieTicket.kbnMaeuriken,
                kbnKensyu: params.movieTicket.kbnKensyu,
                salesPrice: params.movieTicket.salesPrice,
                appPrice: params.movieTicket.appPrice,
                kbnEisyahousiki: params.movieTicket.kbnEisyahousiki,
                titleCode: coaInfo.titleCode,
                titleBranchNum: coaInfo.titleBranchNum,
                dateJouei: coaInfo.dateJouei
            });

            availableSalesTickets.push({
                ticketCode: mvtkTicketcodeResult.ticketCode,
                ticketName: mvtkTicketcodeResult.ticketName,
                ticketNameKana: mvtkTicketcodeResult.ticketNameKana,
                ticketNameEng: mvtkTicketcodeResult.ticketNameEng,
                // ムビチケチケットインターフェース属性が少なめなので補ってあげる
                stdPrice: 0,
                addPrice: 0,
                salePrice: mvtkTicketcodeResult.addPrice,
                limitCount: 1,
                limitUnit: '001',
                ticketNote: '',
                addGlasses: mvtkTicketcodeResult.addPriceGlasses,
                flgMember: COA.factory.reserve.FlgMember.NonMember,
                usePoint: 0,
                flgMvtk: true,
                kbnEisyahousiki: params.movieTicket.kbnEisyahousiki,
                mvtkKbnDenshiken: params.movieTicket.kbnDenshiken,
                mvtkKbnMaeuriken: params.movieTicket.kbnMaeuriken,
                mvtkKbnKensyu: params.movieTicket.kbnKensyu,
                mvtkSalesPrice: params.movieTicket.salesPrice,
                mvtkAppPrice: params.movieTicket.appPrice
            });
        }
    } catch (error) {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next: please write tests */
        // COAサービスエラーの場合ハンドリング
        if (error.name === 'COAServiceError') {
            // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
            // 500未満であればクライアントエラーとみなす
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (error.code < INTERNAL_SERVER_ERROR) {
                throw new factory.errors.Argument('COA argument', error.message);
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next: please write tests */
        throw error;
    }

    return availableSalesTickets;
}

// @ts-ignore
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function searchEventTicketOffers4COA(params: {
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    project: factory.project.IProject;
}): Promise<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    const event = params.event;

    const offerService = new chevre.service.Offer({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });

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
    const reserveService = new COA.service.Reserve(
        {
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        },
        { timeout: COA_TIMEOUT }
    );
    const salesTickets = await reserveService.salesTicket({
        ...coaInfo,
        flgMember: COA.factory.reserve.FlgMember.Member
    });

    const searchOffersResult = await offerService.search({
        limit: 100,
        project: { id: { $eq: params.project.id } },
        itemOffered: { typeOf: { $eq: 'EventService' } },
        id: { $in: salesTickets.map((t) => `COA-${theaterCode}-${t.ticketCode}`) }
    });

    // ChevreオファーにCOA券種情報を付加して返却
    return salesTickets.map((t) => {
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
}

/**
 * COA販売券種をオファーへ変換する
 * COAの券種インターフェースをchevreのチケットオファーインターフェースへ変換します
 */
// tslint:disable-next-line:max-func-body-length
function coaSalesTicket2offer(params: {
    project: factory.project.IProject;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    salesTicket: COA.factory.reserve.ISalesTicketResult;
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
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.offerType.Offer,
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
            serviceType: <any>{
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: 'CategoryCode'
            }
        }
    };
}
