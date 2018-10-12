import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment';

import * as chevre from '../../../../../../chevre';
import * as factory from '../../../../../../factory';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as EventRepo } from '../../../../../../repo/event';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ICreateOperation<T> = (repos: {
    event: EventRepo;
    action: ActionRepo;
    transaction: TransactionRepo;
    eventService: chevre.service.Event;
    reserveService: chevre.service.transaction.Reserve;
}) => Promise<T>;

/**
 * 座席予約に対する承認アクションを開始する前の処理
 * 供給情報の有効性の確認などを行う。
 * この処理次第で、どのような供給情報を受け入れられるかが決定するので、とても大事な処理です。
 * バグ、不足等あれば、随時更新することが望ましい。
 */
// tslint:disable-next-line:max-func-body-length
// async function validateOffers(
//     isMember: boolean,
//     screeningEvent: factory.chevre.event.screeningEvent.IEvent,
//     offers: factory.offer.seatReservation.IOffer[]
// ): Promise<factory.offer.seatReservation.IOfferWithDetails[]> {
// }

/**
 * 供給情報から承認アクションの価格を導き出す
 * @param offers 供給情報
 */
// function offers2resultPrice(offers: factory.offer.seatReservation.IOfferWithDetails[]) {
//     const price = offers.reduce((a, b) => a + b.price, 0);
//     const point = offers.reduce((a, b) => a + b.ticketInfo.usePoint, 0);

//     return { price, point };
// }

/**
 * 座席を仮予約する
 * 承認アクションオブジェクトが返却されます。
 */
export function create(params: factory.chevre.transaction.reserve.IObjectWithoutDetail & {
    agentId: string;
    transactionId: string;
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        transaction: TransactionRepo;
        eventService: chevre.service.Event;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        debug('creating authorize action...', params);
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 供給情報の有効性を確認
        const availableTicketOffers = await repos.eventService.searchScreeningEventTicketOffers({ eventId: params.event.id });
        const acceptedOffers: factory.chevre.event.screeningEvent.IAcceptedTicketOffer[] =
            params.acceptedOffer.map((offerWithoutDetail) => {
                const offer = availableTicketOffers.find((o) => o.id === offerWithoutDetail.id);
                if (offer === undefined) {
                    throw new factory.errors.NotFound('Ticket Offer', `Ticket Offer ${offerWithoutDetail.id} not found`);
                }

                return { ...offerWithoutDetail, ...offer };
            });

        // 承認アクションを開始
        const seller = transaction.seller;
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                event: params.event,
                acceptedOffer: acceptedOffers,
                notes: params.notes
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
            purpose: transaction // purposeは取引
        };
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        let reserveTransaction: chevre.factory.transaction.reserve.ITransaction;
        try {
            debug('starting reserve transaction...');
            reserveTransaction = await repos.reserveService.start({
                typeOf: chevre.factory.transactionType.Reserve,
                agent: {
                    typeOf: transaction.agent.typeOf,
                    name: transaction.agent.id
                },
                object: params,
                expires: moment(transaction.expires).add(1, 'month').toDate() // 余裕を持って
            });
            debug('reserve transaction started', reserveTransaction.id);
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
                    throw new factory.errors.Argument('ScreeningEvent', error.message);
                } else {
                    throw new factory.errors.ServiceUnavailable('Reserve service temporarily unavailable.');
                }
            }

            throw new factory.errors.ServiceUnavailable('Unexepected error occurred.');
        }

        // 金額計算
        const amount = reserveTransaction.object.reservations.reduce((a, b) => a + b.price, 0);

        // アクションを完了
        debug('ending authorize action...');
        const result: factory.action.authorize.offer.seatReservation.IResult = {
            price: amount,
            priceCurrency: reserveTransaction.object.reservations[0].priceCurrency,
            point: 0,
            responseBody: reserveTransaction
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 座席予約承認アクションをキャンセルする
 */
export function cancel(params: {
    agentId: string;
    transactionId: string;
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }
        // MongoDBでcompleteステータスであるにも関わらず、Chevreでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        if (action.result !== undefined) {
            const actionResult = <factory.action.authorize.offer.seatReservation.IResult>action.result;
            // 座席予約キャンセル
            await repos.reserveService.cancel({ transactionId: actionResult.responseBody.id });
        }
    };
}
