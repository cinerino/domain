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
export type WebAPIIdentifier = factory.action.authorize.offer.seatReservation.WebAPIIdentifier;

/**
 * 座席予約承認
 */
export function create<T extends WebAPIIdentifier>(params: {
    object: factory.chevre.transaction.reserve.IObjectWithoutDetail;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<T>> {
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

        let coaInfo: any;
        if (Array.isArray(event.additionalProperty)) {
            // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
            const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
            coaInfo = (coaInfoProperty !== undefined) ? coaInfoProperty.value : undefined;
        }

        let acceptedOffers: factory.chevre.event.screeningEvent.IAcceptedTicketOffer[] = [];
        const availableTicketOffers = await OfferService.searchScreeningEventTicketOffers({
            event: params.object.event,
            seller: seller
        })(repos);
        acceptedOffers = params.object.acceptedOffer.map((offerWithoutDetail) => {
            const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
            }

            return { ...offerWithoutDetail, ...offer };
        });

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes<T> = {
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
            instrument: {
                typeOf: 'WebAPI',
                identifier: (coaInfo !== undefined)
                    ? <T>factory.action.authorize.offer.seatReservation.WebAPIIdentifier.COA
                    : <T>factory.action.authorize.offer.seatReservation.WebAPIIdentifier.Chevre
            }
        };
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        let responseBody: factory.action.authorize.offer.seatReservation.IResponseBody<T>;
        try {
            if (coaInfo !== undefined) {
                // COAにて仮予約
                const updTmpReserveSeatArgs = {
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
                debug('updTmpReserveSeat processing...', updTmpReserveSeatArgs);
                responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<T>>
                    await COA.services.reserve.updTmpReserveSeat(updTmpReserveSeatArgs);
                debug('updTmpReserveSeat processed', responseBody);
            } else {
                // 基本的にCHEVREにて予約取引開始
                debug('starting reserve transaction...');
                responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<T>>
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
        const result: factory.action.authorize.offer.seatReservation.IResult<T> = {
            price: amount,
            priceCurrency: acceptedOffers[0].priceCurrency,
            point: 0,
            responseBody: responseBody
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 受け入れらたオファーの内容を検証する
 */
// function validateAcceptedOffers(params: factory.chevre.transaction.reserve.IObjectWithoutDetail) {
//     return async (repos: {
//         event: EventRepo;
//         action: ActionRepo;
//         transaction: TransactionRepo;
//         eventService: chevre.service.Event;
//         reserveService: chevre.service.transaction.Reserve;
//     }) => {
//         // 供給情報の有効性を確認
//         const availableTicketOffers = await repos.eventService.searchScreeningEventTicketOffers({ eventId: params.event.id });
//         const acceptedOffers: factory.chevre.event.screeningEvent.IAcceptedTicketOffer[] =
//             params.acceptedOffer.map((offerWithoutDetail) => {
//                 const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
//                 if (offer === undefined) {
//                     throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
//                 }

//                 return { ...offerWithoutDetail, ...offer };
//             });

//         // 承認要求者とオファーの条件を検証
//         acceptedOffers.forEach((offer) => {
//             if (offer.availability === factory.chevre.itemAvailability.InStoreOnly) {

//             }
//         });

//         return acceptedOffers;
//     };
// }

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
        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.result !== undefined) {
            const actionResult = <factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier>>action.result;
            let responseBody = actionResult.responseBody;

            if (action.instrument === undefined) {
                action.instrument = {
                    typeOf: 'WebAPI',
                    identifier: factory.action.authorize.offer.seatReservation.WebAPIIdentifier.Chevre
                };
            }

            switch (action.instrument.identifier) {
                case factory.action.authorize.offer.seatReservation.WebAPIIdentifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.action.authorize.offer.seatReservation.WebAPIIdentifier.COA>>responseBody;

                    // tslint:disable-next-line:no-suspicious-comment
                    // TODO COAで仮予約取消
                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.action.authorize.offer.seatReservation.WebAPIIdentifier.Chevre>>responseBody;

                    // 座席予約キャンセル
                    await repos.reserveService.cancel({ id: responseBody.id });
            }
        }
    };
}
