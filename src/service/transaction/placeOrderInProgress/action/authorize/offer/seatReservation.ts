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
 * @param agentId 取引主体ID
 * @param transactionId 取引ID
 * @param eventIdentifier イベント識別子
 * @param offers 供給情報
 */
export function create(params: factory.chevre.transaction.reserve.IObjectWithoutDetail & {
    agentId: string;
    transactionId: string;
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction> {
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        transaction: TransactionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 上映イベントを取得
        // const screeningEvent = await repos.event.findScreeningEventById(params.event.id);

        // 供給情報の有効性を確認
        // const offersWithDetails =
        //     await validateOffers((transaction.agent.memberOf !== undefined), screeningEvent, params.offers);

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                event: params.event,
                tickets: params.tickets,
                notes: params.notes
            },
            agent: transaction.seller,
            recipient: transaction.agent,
            purpose: transaction // purposeは取引
        };
        const action = await repos.action.start(actionAttributes);

        // 座席仮予約
        let response: chevre.factory.transaction.reserve.ITransaction;
        try {
            debug('starting reserve transaction...');
            response = await repos.reserveService.start({
                typeOf: chevre.factory.transactionType.Reserve,
                agent: {
                    typeOf: transaction.agent.typeOf,
                    name: transaction.agent.id
                },
                object: params,
                expires: moment(transaction.expires).add(1, 'month').toDate() // 余裕を持って
            });
            debug('reserve transaction started', response.id);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
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

        // アクションを完了
        debug('ending authorize action...');
        // const { price, point } = offers2resultPrice(offersWithDetails);
        const result: factory.action.authorize.offer.seatReservation.IResult = {
            price: response.object.reservations.reduce((a, b) => a + b.reservedTicket.ticketType.charge, 0),
            priceCurrency: factory.priceCurrency.JPY,
            point: 0,
            responseBody: response
        };

        return repos.action.complete(action.typeOf, action.id, result);
    };
}

/**
 * 座席予約承認アクションをキャンセルする
 * @param agentId アクション主体ID
 * @param transactionId 取引ID
 * @param actionId アクションID
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
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }
        // MongoDBでcompleteステータスであるにも関わらず、Chevreでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = await repos.action.cancel(factory.actionType.AuthorizeAction, params.actionId);
        if (action.result !== undefined) {
            const actionResult = <factory.action.authorize.offer.seatReservation.IResult>action.result;
            // 座席予約キャンセル
            await repos.reserveService.cancel({ transactionId: actionResult.responseBody.id });
        }
    };
}
