import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';

import * as chevre from '../../../../../../chevre';
import * as COA from '../../../../../../coa';
import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as EventRepo } from '../../../../../../repo/event';
import { MongoRepository as OrganizationRepo } from '../../../../../../repo/organization';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import * as OfferService from '../../../../../offer';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    event: EventRepo;
    action: ActionRepo;
    organization: OrganizationRepo;
    transaction: TransactionRepo;
    eventService: chevre.service.Event;
    reserveService: chevre.service.transaction.Reserve;
}) => Promise<T>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

/**
 * 座席予約承認
 */
export function create(params: {
    object: factory.chevre.transaction.reserve.IObjectWithoutDetail;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        organization: OrganizationRepo;
        transaction: TransactionRepo;
        eventService: chevre.service.Event;
        reserveService: chevre.service.transaction.Reserve;
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

        let offeredThrough = event.offers.offeredThrough;
        if (offeredThrough === undefined) {
            offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        const acceptedOffers = await validateAcceptedOffers({
            object: params.object,
            event: event,
            seller: seller
        })(repos);

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes<typeof offeredThrough.identifier> = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                event: event,
                acceptedOffer: acceptedOffers,
                notes: params.object.notes
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
            instrument: event.offers.offeredThrough
        };
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        let requestBody: factory.action.authorize.offer.seatReservation.IRequestBody;
        let responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<typeof offeredThrough.identifier>;
        try {
            switch (offeredThrough.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    let coaInfo: any;
                    if (Array.isArray(event.additionalProperty)) {
                        // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
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
                                seatSection: offer.ticketedSeat.seatSection,
                                seatNum: offer.ticketedSeat.seatNumber
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
                            typeOf: chevre.factory.transactionType.Reserve,
                            agent: {
                                typeOf: transaction.agent.typeOf,
                                name: transaction.agent.id
                            },
                            object: params.object,
                            expires: moment(transaction.expires).add(1, 'month').toDate() // 余裕を持って
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
            // アイテム数が要件を満たしていなければエラー
            if (acceptedOffersByOfferId.length % referenceQuantityValue !== 0) {
                throw new factory.errors.Argument(
                    'acceptedOffers',
                    `Offer ${offerId} requires eligible quantity value '${referenceQuantityValue}'`
                );
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
    object: factory.chevre.transaction.reserve.IObjectWithoutDetail;
    event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    seller: { typeOf: factory.organizationType; id: string };
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        organization: OrganizationRepo;
        eventService: chevre.service.Event;
    }): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer[]> => {
        // 利用可能なチケットオファーを検索
        const availableTicketOffers = await OfferService.searchScreeningEventTicketOffers({
            event: params.object.event,
            seller: params.seller
        })(repos);

        // 利用可能なチケットオファーであれば受け入れる
        // tslint:disable-next-line:max-func-body-length
        return Promise.all(params.object.acceptedOffer.map(async (offerWithoutDetail) => {
            const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
            }

            const acceptedOffer: factory.action.authorize.offer.seatReservation.IAcceptedOffer = {
                additionalProperty: [],
                ...offerWithoutDetail,
                ...offer
            };

            let offeredThrough = params.event.offers.offeredThrough;
            if (offeredThrough === undefined) {
                offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }

            switch (offeredThrough.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // 制限単位がn人単位(例えば夫婦割り)の場合、同一券種の数を確認
                    // '001'の値は、区分マスター取得APIにて、"kubunCode": "011"を指定すると取得できる
                    // if (availableSalesTicket.limitUnit === '001') {
                    // }

                    const coaInfoProperty = acceptedOffer.additionalProperty.find((p) => p.name === 'coaInfo');
                    if (coaInfoProperty === undefined) {
                        throw new factory.errors.NotFound('Offer coaInfo');
                    }

                    const coaInfo = {
                        ...coaInfoProperty.value,
                        disPrice: 0,
                        addGlasses: 0,
                        mvtkAppPrice: 0,
                        ticketCount: 1,
                        seatNum: acceptedOffer.ticketedSeat.seatNumber,
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

                    // coaInfoプロパティを上書きする
                    acceptedOffer.additionalProperty = acceptedOffer.additionalProperty.filter((p) => p.name !== 'coaInfo');
                    acceptedOffer.additionalProperty.push({
                        name: 'coaInfo',
                        value: coaInfo
                    });

                    break;

                default:
                // no op
            }

            return acceptedOffer;
        }));
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

            if (event.offers.offeredThrough === undefined) {
                event.offers.offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }

            if (action.instrument === undefined) {
                action.instrument = event.offers.offeredThrough;
            }

            switch (action.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    let coaInfo: any;
                    if (Array.isArray(event.additionalProperty)) {
                        const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                        coaInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
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
