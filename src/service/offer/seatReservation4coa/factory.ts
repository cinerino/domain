import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';

import { credentials } from '../../../credentials';

import { handleCOAReserveTemporarilyError } from '../../../errorHandler';

import * as chevre from '../../../chevre';
import * as COA from '../../../coa';
import { factory } from '../../../factory';

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export import WebAPIIdentifier = factory.service.webAPI.Identifier;

/**
 * ムビチケ券種インターフェース
 */
export type ICOAMvtkTicket = COA.factory.master.IMvtkTicketcodeResult & {
    stdPrice: number;
    salePrice: number;
    addGlasses: number;
};

export type IAcceptedOfferWithoutDetail =
    factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail<WebAPIIdentifier.COA> & {
        additionalProperty?: factory.propertyValue.IPropertyValue<string>[];
        ticketInfo: factory.offer.seatReservation.ICOATicketInfo & {
            spseatAdd1: number;
            spseatAdd2: number;
            spseatKbn: string;
        };
    };

export function createAuthorizeSeatReservationActionAttributes(params: {
    acceptedOffers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.COA>[];
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
}): factory.action.authorize.offer.seatReservation.IAttributes<WebAPIIdentifier.COA> {
    const transaction = params.transaction;

    return {
        project: transaction.project,
        typeOf: factory.actionType.AuthorizeAction,
        object: {
            typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
            acceptedOffer: params.acceptedOffers,
            event: params.event,
            ...{ offers: params.acceptedOffers } // 互換性維持のため
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
            ...(transaction.agent.typeOf === factory.personType.Person && transaction.agent.memberOf !== undefined)
                ? { memberOf: transaction.agent.memberOf }
                : undefined
        },
        purpose: { typeOf: transaction.typeOf, id: transaction.id },
        instrument: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.COA }
    };
}

export async function createAcceptedOffersWithoutDetails(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}): Promise<IAcceptedOfferWithoutDetail[]> {
    const reserveService = new COA.service.Reserve(
        {
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        },
        { timeout: COA_TIMEOUT }
    );

    const { listSeat } = await reserveService.stateReserveSeat(params.coaInfo);

    // 供給情報の有効性を確認
    return params.object.acceptedOffer.map((offer) => {
        const section = listSeat.find((s) => s.seatSection === offer.seatSection);
        if (section === undefined) {
            throw new factory.errors.NotFound('Available Section');
        }

        const freeSeat = section.listFreeSeat.find((s) => s.seatNum === offer.seatNumber);
        if (freeSeat === undefined) {
            // throw new factory.errors.NotFound('Available Seat');
            throw new factory.errors.AlreadyInUse('offer', ['seatNumber'], 'Seat not available');
        }

        const spseatAdd1 = (typeof freeSeat.spseatAdd1 === 'number') ? freeSeat.spseatAdd1 : 0;
        const spseatAdd2 = (typeof freeSeat.spseatAdd2 === 'number') ? freeSeat.spseatAdd2 : 0;
        const spseatKbn = (typeof freeSeat.spseatKbn === 'string') ? freeSeat.spseatKbn : '';

        return {
            ...offer,
            ticketInfo: {
                ...offer.ticketInfo,
                spseatAdd1: spseatAdd1,
                spseatAdd2: spseatAdd2,
                spseatKbn: spseatKbn
            }
        };
    });
}

function offer2availableSalesTicket(params: {
    project: { id: string };
    offers: IAcceptedOfferWithoutDetail[];
    offer: IAcceptedOfferWithoutDetail;
    offerIndex: number;
    availableSalesTickets: COA.factory.reserve.ISalesTicketResult[];
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}) {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        offer: chevre.service.Offer;
    }) => {
        let availableSalesTicket: COA.factory.reserve.ISalesTicketResult | ICOAMvtkTicket | undefined;
        let coaPointTicket: COA.factory.master.ITicketResult | undefined;

        const offers = params.offers;
        const offer = params.offer;
        const offerIndex = params.offerIndex;
        const availableSalesTickets = params.availableSalesTickets;
        const coaInfo = params.coaInfo;

        const masterService = new COA.service.Master(
            {
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            },
            { timeout: COA_TIMEOUT }
        );

        const isMvtkOrMG = typeof offer.ticketInfo.mvtkNum === 'string' && offer.ticketInfo.mvtkNum.length > 0;

        // ポイント消費鑑賞券の場合
        if (typeof offer.ticketInfo.usePoint === 'number' && offer.ticketInfo.usePoint > 0) {
            // COA側のマスタ構成で、
            // 券種マスタに消費ポイント
            // 販売可能チケット情報に販売金額
            // を持っているので、処理が少し冗長になってしまうが、しょうがない
            try {
                let availableTickets: COA.factory.master.ITicketResult[] | undefined;

                // Chevreでオファー検索トライ
                const offerIdentifier = `COA-${coaInfo.theaterCode}-${offer.ticketInfo.ticketCode}`;
                const searchOffersResult = await repos.offer.search({
                    limit: 1,
                    project: { id: { $eq: params.project.id } },
                    itemOffered: { typeOf: { $eq: 'EventService' } },
                    identifier: { $eq: offerIdentifier }
                });
                if (searchOffersResult.data.length > 0) {
                    availableTickets = searchOffersResult.data.map((o) => {
                        return {
                            ticketCode: (typeof o.additionalProperty?.find((p) => p.name === 'ticketCode')?.value === 'string')
                                ? String(o.additionalProperty?.find((p) => p.name === 'ticketCode')?.value)
                                : '',
                            ticketName: (typeof o.additionalProperty?.find((p) => p.name === 'ticketName')?.value === 'string')
                                ? String(o.additionalProperty?.find((p) => p.name === 'ticketName')?.value)
                                : '',
                            ticketNameKana: (typeof o.additionalProperty?.find((p) => p.name === 'ticketNameKana')?.value === 'string')
                                ? String(o.additionalProperty?.find((p) => p.name === 'ticketNameKana')?.value)
                                : '',
                            ticketNameEng: (typeof o.additionalProperty?.find((p) => p.name === 'ticketNameEng')?.value === 'string')
                                ? String(o.additionalProperty?.find((p) => p.name === 'ticketNameEng')?.value)
                                : '',
                            usePoint: (typeof o.additionalProperty?.find((p) => p.name === 'usePoint')?.value === 'string')
                                ? Number(o.additionalProperty?.find((p) => p.name === 'usePoint')?.value)
                                : 0,
                            flgMember: (typeof o.additionalProperty?.find((p) => p.name === 'flgMember')?.value === 'string')
                                ? <COA.factory.master.FlgMember>String(o.additionalProperty?.find((p) => p.name === 'flgMember')?.value)
                                : COA.factory.master.FlgMember.NonMember
                        };
                    });
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (availableTickets === undefined) {
                    availableTickets = await masterService.ticket({
                        theaterCode: coaInfo.theaterCode
                    });
                }
                coaPointTicket = availableTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if: please write tests */
                if (coaPointTicket === undefined) {
                    throw new factory.errors.NotFound(
                        `offers.${offerIndex}`,
                        `ticketInfo of ticketCode ${offer.ticketInfo.ticketCode} is invalid.`);
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
                        throw new factory.errors.NotFound(
                            `offers.${offerIndex}`,
                            `ticketCode ${offer.ticketInfo.ticketCode} not found. ${error.message}`
                        );
                    }
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next: please write tests */
                throw error;
            }

            availableSalesTicket = availableSalesTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);
            // 利用可能な券種が見つからなければエラー
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (availableSalesTicket === undefined) {
                throw new factory.errors.NotFound(`offers.${offerIndex}`, `ticketCode ${offer.ticketInfo.ticketCode} not found.`);
            }
        } else if (isMvtkOrMG) {
            // ムビチケの場合、ムビチケ情報をCOA券種に変換
            try {
                const kbnMgtk = offer.ticketInfo.kbnMgtk;
                if (typeof kbnMgtk === 'string' && kbnMgtk === 'MG') {
                    const mgtkTicketcodeResult = await masterService.mgtkTicketcode({
                        theaterCode: coaInfo.theaterCode,
                        mgtkTicketcode: offer.ticketInfo.mvtkKbnKensyu, // MG券種区分
                        titleCode: coaInfo.titleCode,
                        titleBranchNum: coaInfo.titleBranchNum,
                        dateJouei: coaInfo.dateJouei
                    });
                    availableSalesTicket = {
                        ...mgtkTicketcodeResult,
                        // ムビチケチケットインターフェース属性が少なめなので補ってあげる
                        stdPrice: 0,
                        salePrice: mgtkTicketcodeResult.addPrice,
                        addGlasses: mgtkTicketcodeResult.addPriceGlasses
                    };
                } else {
                    const mvtkTicketcodeResult = await masterService.mvtkTicketcode({
                        theaterCode: coaInfo.theaterCode,
                        kbnDenshiken: offer.ticketInfo.mvtkKbnDenshiken,
                        kbnMaeuriken: offer.ticketInfo.mvtkKbnMaeuriken,
                        kbnKensyu: offer.ticketInfo.mvtkKbnKensyu,
                        salesPrice: offer.ticketInfo.mvtkSalesPrice,
                        appPrice: offer.ticketInfo.mvtkAppPrice,
                        kbnEisyahousiki: offer.ticketInfo.kbnEisyahousiki,
                        titleCode: coaInfo.titleCode,
                        titleBranchNum: coaInfo.titleBranchNum,
                        dateJouei: coaInfo.dateJouei
                    });
                    availableSalesTicket = {
                        ...mvtkTicketcodeResult,
                        // ムビチケチケットインターフェース属性が少なめなので補ってあげる
                        stdPrice: 0,
                        salePrice: mvtkTicketcodeResult.addPrice,
                        addGlasses: mvtkTicketcodeResult.addPriceGlasses
                    };
                }
            } catch (error) {
                // COAサービスエラーの場合ハンドリング
                if (error.name === 'COAServiceError') {
                    // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
                    // 500未満であればクライアントエラーとみなす
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (error.code < INTERNAL_SERVER_ERROR) {
                        throw new factory.errors.NotFound(
                            `offers.${offerIndex}`,
                            `ticketCode ${offer.ticketInfo.ticketCode} not found. ${error.message}`
                        );
                    }
                }

                throw error;
            }

            // COA券種が見つかっても、指定された券種コードと異なればエラー
            if (offer.ticketInfo.ticketCode !== availableSalesTicket.ticketCode) {
                throw new factory.errors.NotFound(
                    `offers.${offerIndex}`,
                    `ticketInfo of ticketCode ${offer.ticketInfo.ticketCode} is invalid.`);
            }
        } else {
            availableSalesTicket = availableSalesTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);

            // 利用可能な券種が見つからなければエラー
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (availableSalesTicket === undefined) {
                throw new factory.errors.NotFound(`offers.${offerIndex}`, `ticketCode ${offer.ticketInfo.ticketCode} not found.`);
            }

            const ticketCode = availableSalesTicket.ticketCode;

            // 制限単位がn人単位(例えば夫婦割り)の場合、同一券種の数を確認
            // '001'の値は、区分マスター取得APIにて、"kubunCode": "011"を指定すると取得できる
            if (availableSalesTicket.limitUnit === '001') {
                const numberOfSameOffer = offers.filter((o) => o.ticketInfo.ticketCode === ticketCode).length;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (numberOfSameOffer % availableSalesTicket.limitCount !== 0) {
                    // 割引条件が満たされていません
                    // 選択した券種の中に、割引券が含まれています。
                    // 割引券の適用条件を再度ご確認ください。
                    const invalidOfferIndexes = offers.reduce<number[]>(
                        (a, b, index) => (b.ticketInfo.ticketCode === ticketCode) ? [...a, ...[index]] : a,
                        []
                    );

                    throw invalidOfferIndexes.map((index) => new factory.errors.Argument(`offers.${index}`, '割引条件が満たされていません。'));
                }
            }
        }

        return {
            availableSalesTicket,
            coaPointTicket
        };
    };
}

// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function availableSalesTicket2offerWithDetails(params: {
    project: factory.chevre.project.IProject;
    availableSalesTicket: COA.factory.reserve.ISalesTicketResult | ICOAMvtkTicket;
    coaPointTicket: COA.factory.master.ITicketResult | undefined;
    offer: IAcceptedOfferWithoutDetail;
    offerIndex: number;
}) {
    let offerWithDetails: factory.offer.seatReservation.IOfferWithDetails;

    const availableSalesTicket = params.availableSalesTicket;
    const coaPointTicket = params.coaPointTicket;
    const offer = params.offer;

    const includeGlasses = (offer.ticketInfo.addGlasses > 0);
    const addGlasses = (includeGlasses) ? availableSalesTicket.addGlasses : 0;
    const spseatAdd1 = offer.ticketInfo.spseatAdd1;
    const spseatAdd2 = offer.ticketInfo.spseatAdd2;

    // 実際の売上金額を算出
    const price = [
        Number(availableSalesTicket.salePrice),
        addGlasses,
        spseatAdd1,
        spseatAdd2
    ].reduce((a, b) => a + b, 0);

    // COAに渡す販売金額については、特別席加算額は興収部分のみ加算
    const salePrice = [
        Number(availableSalesTicket.salePrice),
        addGlasses,
        spseatAdd1
    ].reduce((a, b) => a + b, 0);

    // tslint:disable-next-line:max-line-length
    const unitPriceSpec: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification> = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
        name: { ja: availableSalesTicket.ticketName, en: availableSalesTicket.ticketNameEng },
        price: Number(availableSalesTicket.stdPrice),
        priceCurrency: factory.chevre.priceCurrency.JPY,
        referenceQuantity: {
            typeOf: 'QuantitativeValue',
            unitCode: factory.chevre.unitCode.C62,
            value: 1
        },
        valueAddedTaxIncluded: true
    };

    switch ((<COA.factory.reserve.ISalesTicketResult>availableSalesTicket).limitUnit) {
        case '001':
            unitPriceSpec.referenceQuantity.value = (<COA.factory.reserve.ISalesTicketResult>availableSalesTicket).limitCount;
            unitPriceSpec.price = (<COA.factory.reserve.ISalesTicketResult>availableSalesTicket).limitCount * availableSalesTicket.stdPrice;
            break;
        case '002':
            unitPriceSpec.referenceQuantity.minValue = (<COA.factory.reserve.ISalesTicketResult>availableSalesTicket).limitCount;
            break;
        default:
            unitPriceSpec.referenceQuantity.value = 1;
    }

    const isMvtkOrMG = typeof offer.ticketInfo.mvtkNum === 'string' && offer.ticketInfo.mvtkNum.length > 0;

    // tslint:disable-next-line:max-line-length
    let movieTicketTypeChargePriceSpec: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification> | undefined;
    if (isMvtkOrMG) {
        const kbnMgtk = offer.ticketInfo.kbnMgtk;
        let availablePaymentMethod: string = factory.chevre.paymentMethodType.MovieTicket;
        if (typeof kbnMgtk === 'string' && kbnMgtk === 'MG') {
            availablePaymentMethod = factory.chevre.paymentMethodType.MGTicket;
        }

        movieTicketTypeChargePriceSpec = {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification,
            name: { ja: availableSalesTicket.ticketName, en: availableSalesTicket.ticketNameEng },
            price: Number(availableSalesTicket.addPrice),
            priceCurrency: factory.chevre.priceCurrency.JPY,
            valueAddedTaxIncluded: true,
            appliesToMovieTicket: {
                typeOf: factory.chevre.service.paymentService.PaymentServiceType.MovieTicket,
                serviceType: offer.ticketInfo.mvtkKbnKensyu,
                serviceOutput: { typeOf: availablePaymentMethod }
            },
            appliesToVideoFormat: offer.ticketInfo.kbnEisyahousiki,
            ...{
                // 互換性維持対応
                appliesToMovieTicketType: offer.ticketInfo.mvtkKbnKensyu
            }
        };
    }

    const priceSpecification: factory.chevre.compoundPriceSpecification.IPriceSpecification<any> = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
        priceCurrency: factory.chevre.priceCurrency.JPY,
        priceComponent: [
            unitPriceSpec,
            ...(movieTicketTypeChargePriceSpec !== undefined) ? [movieTicketTypeChargePriceSpec] : []
        ],
        valueAddedTaxIncluded: true
    };

    let eligibleMonetaryAmount: factory.chevre.offer.IEligibleMonetaryAmount | undefined;
    if (coaPointTicket !== undefined) {
        eligibleMonetaryAmount = {
            typeOf: 'MonetaryAmount',
            currency: 'Point',
            value: coaPointTicket.usePoint
        };
    }

    const ticketInfo: factory.offer.seatReservation.ICOATicketInfoWithDetails = {
        ticketCode: availableSalesTicket.ticketCode,
        ticketName: availableSalesTicket.ticketName,
        ticketNameEng: availableSalesTicket.ticketNameEng,
        ticketNameKana: availableSalesTicket.ticketNameKana,
        stdPrice: availableSalesTicket.stdPrice,
        addPrice: availableSalesTicket.addPrice,
        disPrice: 0,
        salePrice: salePrice,
        spseatAdd1: spseatAdd1,
        spseatAdd2: spseatAdd2,
        spseatKbn: offer.ticketInfo.spseatKbn,
        addGlasses: addGlasses,
        ticketCount: 1,
        seatNum: offer.seatNumber,

        usePoint: (coaPointTicket !== undefined) ? coaPointTicket.usePoint : 0,

        mvtkAppPrice: (isMvtkOrMG) ? offer.ticketInfo.mvtkAppPrice : 0,
        kbnEisyahousiki: (isMvtkOrMG) ? offer.ticketInfo.kbnEisyahousiki : '00',
        mvtkNum: (isMvtkOrMG) ? offer.ticketInfo.mvtkNum : '',
        mvtkKbnDenshiken: (isMvtkOrMG) ? offer.ticketInfo.mvtkKbnDenshiken : '00',
        mvtkKbnMaeuriken: (isMvtkOrMG) ? offer.ticketInfo.mvtkKbnMaeuriken : '00',
        mvtkKbnKensyu: (isMvtkOrMG) ? offer.ticketInfo.mvtkKbnKensyu : '00',
        mvtkSalesPrice: (isMvtkOrMG) ? offer.ticketInfo.mvtkSalesPrice : 0,
        kbnMgtk: (typeof offer.ticketInfo.kbnMgtk === 'string') ? offer.ticketInfo.kbnMgtk : ''
    };

    offerWithDetails = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.offerType.Offer,
        id: availableSalesTicket.ticketCode,
        name: { ja: availableSalesTicket.ticketName, en: availableSalesTicket.ticketNameEng },
        alternateName: { ja: availableSalesTicket.ticketNameKana, en: '' },
        price: price,
        priceCurrency: factory.priceCurrency.JPY,
        priceSpecification: priceSpecification,
        seatNumber: offer.seatNumber,
        seatSection: offer.seatSection,
        ticketInfo: ticketInfo,
        itemOffered: {
            serviceOutput: {
                typeOf: factory.chevre.reservationType.EventReservation,
                reservedTicket: {
                    typeOf: 'Ticket',
                    ticketedSeat: {
                        seatSection: offer.seatSection,
                        seatNumber: offer.seatNumber,
                        seatRow: '',
                        // seatingType: selectedSeat.seatingType,
                        typeOf: factory.chevre.placeType.Seat
                    }
                },
                ...(typeof (<any>offer).itemOffered?.serviceOutput?.additionalTicketText === 'string')
                    ? { additionalTicketText: (<any>offer).itemOffered.serviceOutput.additionalTicketText }
                    : undefined,
                ...(Array.isArray((<any>offer).itemOffered?.serviceOutput?.additionalProperty))
                    ? { additionalProperty: (<any>offer).itemOffered.serviceOutput.additionalProperty }
                    : undefined
            }
        },
        ...((<any>offer).itemOffered !== undefined) ? { itemOffered: (<any>offer).itemOffered } : undefined,
        ...(eligibleMonetaryAmount !== undefined) ? { eligibleMonetaryAmount: [eligibleMonetaryAmount] } : undefined
    };

    // メガネ代込み要求の場合、チケット名調整特別対応
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore else */
    if (includeGlasses) {
        offerWithDetails.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
    }

    return offerWithDetails;
}

/**
 * 座席予約に対する承認アクションを開始する前の処理
 * 供給情報の有効性の確認などを行う。
 * この処理次第で、どのような供給情報を受け入れられるかが決定するので、とても大事な処理です。
 * バグ、不足等あれば、随時更新することが望ましい。
 */
export function validateOffers(
    project: { id: string },
    isMember: boolean,
    screeningEvent: factory.event.screeningEvent.IEvent,
    offers: IAcceptedOfferWithoutDetail[]
) {
    return async (repos: {
        offer: chevre.service.Offer;
    }): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]> => {
        const reserveService = new COA.service.Reserve(
            {
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            },
            { timeout: COA_TIMEOUT }
        );

        // 詳細情報ありの供給情報リストを初期化
        // 要求された各供給情報について、バリデーションをかけながら、このリストに追加していく
        const offersWithDetails: factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[] = [];

        // 供給情報が適切かどうか確認
        const availableSalesTickets: COA.factory.reserve.ISalesTicketResult[] = [];

        // 必ず定義されている前提
        const coaInfo = <factory.event.screeningEvent.ICOAInfo>screeningEvent.coaInfo;

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
            availableSalesTickets.push(...salesTickets4nonMember);

            // COA券種取得(会員)
            if (isMember) {
                const salesTickets4member = await reserveService.salesTicket({
                    theaterCode: coaInfo.theaterCode,
                    dateJouei: coaInfo.dateJouei,
                    titleCode: coaInfo.titleCode,
                    titleBranchNum: coaInfo.titleBranchNum,
                    timeBegin: coaInfo.timeBegin,
                    flgMember: COA.factory.reserve.FlgMember.Member
                });
                availableSalesTickets.push(...salesTickets4member);
            }
        } catch (error) {
            throw handleCOAReserveTemporarilyError(error);
        }

        // 利用可能でないチケットコードがオファーに含まれていれば引数エラー
        // オファーごとに確認
        await Promise.all(offers.map(async (offer, offerIndex) => {
            const { availableSalesTicket, coaPointTicket } = await offer2availableSalesTicket({
                project: project,
                offers: offers,
                offer: offer,
                offerIndex: offerIndex,
                availableSalesTickets: availableSalesTickets,
                coaInfo: coaInfo
            })(repos);

            const offerWithDetails = availableSalesTicket2offerWithDetails({
                project: { typeOf: screeningEvent.project.typeOf, id: screeningEvent.project.id },
                availableSalesTicket,
                coaPointTicket,
                offer,
                offerIndex
            });

            offersWithDetails.push({
                ...offerWithDetails,
                addOn: [],
                additionalProperty: (Array.isArray(offer.additionalProperty)) ? offer.additionalProperty : [],
                id: <string>offerWithDetails.id,
                itemOffered: offerWithDetails.itemOffered,
                ...{
                    ticketedSeat: {
                        typeOf: factory.chevre.placeType.Seat,
                        // seatingType?: ISeatingType;
                        seatNumber: offerWithDetails.seatNumber,
                        seatRow: '',
                        seatSection: offerWithDetails.seatSection
                    }
                }
            });
        }));

        return offersWithDetails;
    };
}

/**
 * 供給情報から承認アクションの価格を導き出す
 */
export function offers2resultPrice(
    offers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]
) {
    const price = offers.reduce((a, b) => a + (<number>b.price), 0);
    const requiredPoint = offers.reduce((a, b) => a + b.ticketInfo.usePoint, 0);

    return { price, requiredPoint };
}

export function createUpdTmpReserveSeatArgs(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}): COA.factory.reserve.IUpdTmpReserveSeatArgs {
    return {
        theaterCode: params.coaInfo.theaterCode,
        dateJouei: params.coaInfo.dateJouei,
        titleCode: params.coaInfo.titleCode,
        titleBranchNum: params.coaInfo.titleBranchNum,
        timeBegin: params.coaInfo.timeBegin,
        screenCode: params.coaInfo.screenCode,
        listSeat: params.object.acceptedOffer.map((offer) => {
            return {
                seatSection: offer.seatSection,
                seatNum: offer.seatNumber
            };
        })
    };
}

/**
 * COA仮予約結果から注文アイテムを生成する
 */
export function responseBody2acceptedOffers4result(params: {
    responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>;
    object: factory.action.authorize.offer.seatReservation.IObject<factory.service.webAPI.Identifier.COA>;
    event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    seller: factory.transaction.placeOrder.ISeller;
    bookingTime: Date;
}): factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] {
    const acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] = [];

    const event = params.event;

    const updTmpReserveSeatResult = params.responseBody;

    // 座席仮予約からオファー情報を生成する
    // tslint:disable-next-line:max-func-body-length
    acceptedOffers4result.push(...updTmpReserveSeatResult.listTmpReserve.map((tmpReserve, index) => {
        const requestedOffer = params.object.acceptedOffer.find((o) => {
            return (o.seatNumber === tmpReserve.seatNum && o.seatSection === tmpReserve.seatSection);
        });
        if (requestedOffer === undefined) {
            throw new factory.errors.Argument('offers', '要求された供給情報と仮予約結果が一致しません');
        }

        let coaInfo: factory.event.screeningEvent.ICOAInfo | undefined;
        if (event.coaInfo !== undefined) {
            coaInfo = event.coaInfo;
        } else {
            // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
            const coaInfoProperty = event.additionalProperty?.find((p) => p.name === 'coaInfo');
            coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
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

        const reservationNumber = String(updTmpReserveSeatResult.tmpReserveNum);
        const reservationId = `${reservationNumber}-${index.toString()}`;

        // tslint:disable-next-line:max-line-length
        // const unitPriceSpec = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
        //     requestedOffer.priceSpecification.priceComponent.find(
        //         (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
        //     );
        // if (unitPriceSpec === undefined) {
        //     throw new factory.errors.Argument('Accepted Offer', 'Unit price specification not found');
        // }

        const workPerformed: factory.chevre.event.screeningEventSeries.IWorkPerformed = {
            project: event.superEvent.workPerformed.project,
            id: event.superEvent.workPerformed.id,
            identifier: event.superEvent.workPerformed.identifier,
            name: event.superEvent.workPerformed.name,
            duration: event.superEvent.workPerformed.duration,
            // contentRating: event.superEvent.workPerformed.contentRating,
            typeOf: event.superEvent.workPerformed.typeOf
        };

        const reservationFor: IReservationFor = {
            typeOf: event.typeOf,
            coaInfo: event.coaInfo,
            ...(event.doorTime !== undefined)
                ? {
                    doorTime: moment(event.doorTime)
                        .toDate()
                }
                : undefined,
            endDate: moment(event.endDate)
                .toDate(),
            eventStatus: event.eventStatus,
            identifier: event.identifier,
            location: {
                project: event.location.project,
                typeOf: event.location.typeOf,
                branchCode: event.location.branchCode,
                name: event.location.name
            },
            name: event.name,
            project: event.project,
            startDate: moment(event.startDate)
                .toDate(),
            superEvent: {
                project: event.superEvent.project,
                typeOf: event.superEvent.typeOf,
                eventStatus: event.superEvent.eventStatus,
                id: event.superEvent.id,
                identifier: event.superEvent.identifier,
                name: event.superEvent.name,
                kanaName: event.superEvent.kanaName,
                alternativeHeadline: event.superEvent.alternativeHeadline,
                location: event.superEvent.location,
                videoFormat: event.superEvent.videoFormat,
                soundFormat: event.superEvent.soundFormat,
                workPerformed: workPerformed,
                duration: event.superEvent.duration,
                ...(event.superEvent.endDate !== undefined)
                    ? {
                        endDate: moment(event.superEvent.endDate)
                            .toDate()
                    }
                    : undefined,
                ...(event.superEvent.startDate !== undefined)
                    ? {
                        startDate: moment(event.superEvent.startDate)
                            .toDate()
                    }
                    : undefined,
                coaInfo: event.superEvent.coaInfo
            },
            workPerformed: workPerformed,
            id: event.id
        };

        const reservedTicket: factory.chevre.reservation.ITicket<factory.chevre.reservationType.EventReservation> = {
            typeOf: 'Ticket',
            coaTicketInfo: requestedOffer.ticketInfo,
            dateIssued: params.bookingTime,
            ticketedSeat: {
                typeOf: factory.chevre.placeType.Seat,
                // seatingType: 'Default',
                seatNumber: tmpReserve.seatNum,
                seatRow: '',
                seatSection: tmpReserve.seatSection
            },
            ticketNumber: ticketToken,
            ticketToken: ticketToken,
            ticketType: {
                project: { typeOf: event.project.typeOf, id: event.project.id },
                typeOf: factory.chevre.offerType.Offer,
                id: requestedOffer.id,
                identifier: requestedOffer.id,
                name: requestedOffer.name,
                // description: requestedOffer.description,
                // additionalProperty: requestedOffer.additionalProperty,
                priceCurrency: factory.priceCurrency.JPY
            }
        };

        const additionalProperty = requestedOffer.itemOffered?.serviceOutput?.additionalProperty;
        const additionalTicketText = requestedOffer.itemOffered?.serviceOutput?.additionalTicketText;

        const reservation: factory.order.IReservation = {
            project: { typeOf: event.project.typeOf, id: event.project.id },
            typeOf: factory.chevre.reservationType.EventReservation,
            id: reservationId,
            issuedThrough: { typeOf: factory.product.ProductType.EventService },
            bookingTime: params.bookingTime,
            ...(Array.isArray(additionalProperty)) ? { additionalProperty } : undefined,
            ...(typeof additionalTicketText === 'string') ? { additionalTicketText } : undefined,
            numSeats: 1,
            reservationFor: reservationFor,
            reservationNumber: reservationNumber,
            reservedTicket: reservedTicket
        };

        return {
            project: { typeOf: event.project.typeOf, id: event.project.id },
            typeOf: factory.chevre.offerType.Offer,
            id: requestedOffer.id,
            name: requestedOffer.name,
            itemOffered: reservation,
            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.COA },
            priceSpecification: requestedOffer.priceSpecification,
            priceCurrency: factory.priceCurrency.JPY,
            seller: {
                project: { typeOf: event.project.typeOf, id: event.project.id },
                typeOf: params.seller.typeOf,
                name: params.seller.name
            }
        };
    }));

    return acceptedOffers4result;
}
