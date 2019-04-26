import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';

import * as chevre from '../../../../../../chevre';
import * as COA from '../../../../../../coa';
import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as EventRepo } from '../../../../../../repo/event';
import { MvtkRepository as MovieTicketRepo } from '../../../../../../repo/paymentMethod/movieTicket';
import { MongoRepository as SellerRepo } from '../../../../../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import * as OfferService from '../../../../../offer';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    event: EventRepo;
    eventService: chevre.service.Event;
    action: ActionRepo;
    movieTicket: MovieTicketRepo;
    seller: SellerRepo;
    reserveService: chevre.service.transaction.Reserve;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type IMovieTicketTypeChargeSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification>;

/**
 * 座席予約承認
 */
export function create(params: {
    project: factory.chevre.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        eventService: chevre.service.Event;
        action: ActionRepo;
        movieTicket: MovieTicketRepo;
        seller: SellerRepo;
        reserveService: chevre.service.transaction.Reserve;
        transaction: TransactionRepo;
    }) => {
        debug('creating authorize action...', params);
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const seller = transaction.seller;

        const event = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.object.event.id
        });

        const offers = event.offers;

        let offeredThrough = offers.offeredThrough;
        if (offeredThrough === undefined) {
            offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        const acceptedOffers = await validateAcceptedOffers({
            project: params.project,
            object: params.object,
            event: event,
            seller: seller
        })(repos);

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes<typeof offeredThrough.identifier> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                event: event,
                acceptedOffer: acceptedOffers
            },
            agent: {
                id: transaction.seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            recipient: transaction.agent,
            purpose: { typeOf: transaction.typeOf, id: transaction.id },
            instrument: offeredThrough
        };
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        let requestBody: factory.action.authorize.offer.seatReservation.IRequestBody<typeof offeredThrough.identifier>;
        let responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<typeof offeredThrough.identifier>;
        try {
            switch (offeredThrough.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    let coaInfo: any;
                    if (Array.isArray(event.additionalProperty)) {
                        // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                    }

                    // COAにて仮予約
                    requestBody = {
                        theaterCode: coaInfo.theaterCode,
                        dateJouei: coaInfo.dateJouei,
                        titleCode: coaInfo.titleCode,
                        titleBranchNum: coaInfo.titleBranchNum,
                        timeBegin: coaInfo.timeBegin,
                        screenCode: coaInfo.screenCode,
                        listSeat: params.object.acceptedOffer.map((offer) => {
                            return {
                                seatSection: (offer.ticketedSeat !== undefined) ? offer.ticketedSeat.seatSection : '',
                                seatNum: (offer.ticketedSeat !== undefined) ? offer.ticketedSeat.seatNumber : ''
                            };
                        })
                    };
                    debug('updTmpReserveSeat processing...', requestBody);
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<typeof offeredThrough.identifier>>
                        await COA.services.reserve.updTmpReserveSeat(requestBody);
                    debug('updTmpReserveSeat processed', responseBody);

                    break;

                default:
                    // 基本的にCHEVREにて予約取引開始
                    debug('starting reserve transaction...');
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<typeof offeredThrough.identifier>>
                        await repos.reserveService.start({
                            project: params.project,
                            typeOf: chevre.factory.transactionType.Reserve,
                            agent: {
                                typeOf: transaction.agent.typeOf,
                                name: transaction.agent.id
                            },
                            object: params.object,
                            expires: moment(transaction.expires)
                                .add(1, 'month')
                                .toDate() // 余裕を持って
                        });
                    debug('reserve transaction started', responseBody);
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            // Chevreが500未満であればクライアントエラーとみなす
            const reserveServiceHttpStatusCode = error.code;
            if (Number.isInteger(reserveServiceHttpStatusCode)) {
                if (reserveServiceHttpStatusCode < INTERNAL_SERVER_ERROR) {
                    throw new factory.errors.Argument('Event', error.message);
                } else {
                    throw new factory.errors.ServiceUnavailable('Reserve service temporarily unavailable');
                }
            }

            throw new factory.errors.ServiceUnavailable('Unexepected error occurred');
        }

        // 金額計算
        const offerIds = [...new Set(params.object.acceptedOffer.map((o) => o.id))];
        let amount = acceptedOffers.reduce(
            (a, b) => {
                return a + b.priceSpecification.priceComponent.reduce((a2, b2) => a2 + b2.price, 0);
            },
            0
        );

        // オファーIDごとに単価仕様を考慮して金額を調整
        offerIds.forEach((offerId) => {
            const acceptedOffersByOfferId = acceptedOffers.filter((o) => o.id === offerId);
            let referenceQuantityValue = 1;
            const unitPriceSpec = <IUnitPriceSpecification>acceptedOffersByOfferId[0].priceSpecification.priceComponent.find(
                (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
            );
            if (unitPriceSpec !== undefined && unitPriceSpec.referenceQuantity.value !== undefined) {
                referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
            }

            amount -= unitPriceSpec.price * (referenceQuantityValue - 1) * (acceptedOffersByOfferId.length / referenceQuantityValue);
        });

        // アクションを完了
        debug('ending authorize action...');
        const result: factory.action.authorize.offer.seatReservation.IResult<typeof offeredThrough.identifier> = {
            price: amount,
            priceCurrency: acceptedOffers[0].priceCurrency,
            point: 0,
            requestBody: requestBody,
            responseBody: responseBody
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 受け入れらたオファーの内容を検証
 */
function validateAcceptedOffers(params: {
    project: factory.chevre.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    seller: { typeOf: factory.organizationType; id: string };
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        eventService: chevre.service.Event;
        movieTicket: MovieTicketRepo;
        seller: SellerRepo;
    }): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre>[]> => {
        // 利用可能なチケットオファーを検索
        const availableTicketOffers = await OfferService.searchEventTicketOffers({
            project: params.project,
            event: params.object.event,
            seller: params.seller
        })(repos);

        const acceptedOffersWithoutDetail = params.object.acceptedOffer;

        // 利用可能なチケットオファーであれば受け入れる
        // tslint:disable-next-line:max-func-body-length
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        const acceptedOffers = await Promise.all(acceptedOffersWithoutDetail.map(async (offerWithoutDetail) => {
            const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
            }

            const acceptedOffer: factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre> = {
                ...offerWithoutDetail,
                ...offer,
                // 追加属性をマージ
                additionalProperty: [
                    ...(Array.isArray(offerWithoutDetail.additionalProperty)) ? offerWithoutDetail.additionalProperty : [],
                    ...(Array.isArray(offer.additionalProperty)) ? offer.additionalProperty : []
                ]
            };

            const offers = params.event.offers;

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

                        const movieTheater = await repos.seller.findById({
                            id: params.seller.id
                        });
                        if (movieTheater.paymentAccepted === undefined) {
                            throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
                        }
                        const movieTicketPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                            movieTheater.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
                        if (movieTicketPaymentAccepted === undefined) {
                            throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
                        }

                        // ムビチケ認証
                        const checkResult = await repos.movieTicket.checkByIdentifier({
                            movieTickets: [{
                                typeOf: movieTicket.typeOf,
                                identifier: movieTicket.identifier,
                                accessCode: movieTicket.accessCode,
                                serviceType: '',
                                serviceOutput: <any>{}
                            }],
                            movieTicketPaymentAccepted: movieTicketPaymentAccepted,
                            screeningEvent: params.event
                        });

                        if (checkResult.movieTickets.length === 0) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }
                        if (checkResult.purchaseNumberAuthResult.knyknrNoInfoOut === null) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }
                        if (checkResult.purchaseNumberAuthResult.knyknrNoInfoOut[0].ykknInfo === null) {
                            throw new factory.errors.Argument('Offer', 'Available Movie Ticket not accepted');
                        }

                        const purchaseNumberInfo: mvtkapi.mvtk.services.auth.purchaseNumberAuth.IPurchaseNumberInfo =
                            checkResult.purchaseNumberAuthResult.knyknrNoInfoOut[0];
                        const valieMovieTicketInfo: mvtkapi.mvtk.services.auth.purchaseNumberAuth.IValidTicket =
                            checkResult.purchaseNumberAuthResult.knyknrNoInfoOut[0].ykknInfo[0];

                        let eventCOAInfo: any;
                        if (Array.isArray(params.event.additionalProperty)) {
                            const coaInfoProperty = params.event.additionalProperty.find((p) => p.name === 'coaInfo');
                            eventCOAInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                        }

                        // ムビチケ認証結果を使ってCOA券種に変換
                        let mvtkTicketCodeIn: COA.services.master.IMvtkTicketcodeArgs;
                        let availableSalesTicket: COA.services.master.IMvtkTicketcodeResult;
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
                            availableSalesTicket = await COA.services.master.mvtkTicketcode(mvtkTicketCodeIn);
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
                            addGlasses: 0, // まずメガネ代金なしでデータをセット
                            mvtkAppPrice: mvtkTicketCodeIn.appPrice,
                            ticketCount: 1,
                            seatNum: (acceptedOffer.ticketedSeat !== undefined) ? acceptedOffer.ticketedSeat.seatNumber : '',
                            kbnEisyahousiki: mvtkTicketCodeIn.kbnEisyahousiki,
                            mvtkNum: movieTicket.identifier,
                            mvtkKbnDenshiken: mvtkTicketCodeIn.kbnDenshiken,
                            mvtkKbnMaeuriken: mvtkTicketCodeIn.kbnMaeuriken,
                            mvtkKbnKensyu: mvtkTicketCodeIn.kbnKensyu,
                            mvtkSalesPrice: mvtkTicketCodeIn.salesPrice,
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
                                appliesToVideoFormat: factory.chevre.videoFormatType['2D'],
                                appliesToMovieTicketType: mvtkTicketCodeIn.kbnKensyu
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
                            seatNum: (acceptedOffer.ticketedSeat !== undefined) ? acceptedOffer.ticketedSeat.seatNumber : '',
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
        transaction: TransactionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }
        // MongoDBでcompleteステータスであるにも関わらず、Chevreでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>>
            await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.result !== undefined) {
            const actionResult = action.result;
            let responseBody = actionResult.responseBody;
            const event = action.object.event;
            const offers = event.offers;

            if (offers.offeredThrough === undefined) {
                offers.offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }

            if (action.instrument === undefined || action.instrument === null) {
                action.instrument = offers.offeredThrough;
            }

            switch (action.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    let coaInfo: any;
                    if (Array.isArray(event.additionalProperty)) {
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                    }

                    await COA.services.reserve.delTmpReserve({
                        ...coaInfo,
                        tmpReserveNum: responseBody.tmpReserveNum
                    });

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                    // 座席予約キャンセル
                    await repos.reserveService.cancel({ id: responseBody.id });
            }
        }
    };
}
