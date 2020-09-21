import { INTERNAL_SERVER_ERROR } from 'http-status';

import { credentials } from '../../../credentials';

import { handleCOAReserveTemporarilyError } from '../../../errorHandler';

import * as chevre from '../../../chevre';
import * as COA from '../../../coa';
import * as factory from '../../../factory';

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

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
        ticketInfo: factory.offer.seatReservation.ICOATicketInfo & {
            spseatAdd1: number;
            spseatAdd2: number;
            spseatKbn: string;
        };
    };

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

// tslint:disable-next-line:max-func-body-length
async function offer2availableSalesTicket(params: {
    project: factory.project.IProject;
    offers: IAcceptedOfferWithoutDetail[];
    offer: IAcceptedOfferWithoutDetail;
    offerIndex: number;
    availableSalesTickets: COA.factory.reserve.ISalesTicketResult[];
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}) {
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
            const offerService = new chevre.service.Offer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const searchOffersResult = await offerService.search({
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
    } else if (offer.ticketInfo.mvtkAppPrice > 0) {
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
}

// tslint:disable-next-line:max-func-body-length
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

    // tslint:disable-next-line:max-line-length
    let movieTicketTypeChargePriceSpec: factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification> | undefined;
    if (offer.ticketInfo.mvtkAppPrice > 0) {
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

        mvtkAppPrice: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkAppPrice : 0,
        kbnEisyahousiki: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.kbnEisyahousiki : '00',
        mvtkNum: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkNum : '',
        mvtkKbnDenshiken: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnDenshiken : '00',
        mvtkKbnMaeuriken: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnMaeuriken : '00',
        mvtkKbnKensyu: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnKensyu : '00',
        mvtkSalesPrice: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkSalesPrice : 0,
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
export async function validateOffers(
    project: factory.project.IProject,
    isMember: boolean,
    screeningEvent: factory.event.screeningEvent.IEvent,
    offers: IAcceptedOfferWithoutDetail[]
): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]> {
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
        });

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
            additionalProperty: offer.additionalProperty,
            id: <string>offerWithDetails.id,
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
