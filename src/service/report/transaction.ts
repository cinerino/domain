/**
 * 取引レポートサービス
 */
import * as json2csv from 'json2csv';
import * as moment from 'moment';
import { Readable } from 'stream';
import * as util from 'util';

import * as factory from '../../factory';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引レポートインターフェース
 */
export interface ITransactionReport {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    seller: {
        typeOf: string;
        id: string;
        name: string;
        url: string;
    };
    customer: {
        typeOf: string;
        id: string;
        name: string;
        email: string;
        telephone: string;
        memberOf?: {
            membershipNumber?: string;
        };
        tokenIssuer: string;
        clientId: string;
    };
    items: {
        typeOf: string;
        name: string;
        numItems: number;
        event: {
            typeOf: string;
            id: string;
            name: string;
            startDate: string;
            endDate: string;
            location: string;
            superEventLocationBranchCode: string;
            superEventLocation: string;
        };
    }[];
    orderNumber: string;
    confirmationNumber: string;
    price: string;
    paymentMethodType: string[];
    paymentMethodId: string[];
    discounts: string[];
    discountCodes: string[];
    discountPrices: string[];
}

/**
 * フォーマット指定でストリーミングダウンロード
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function stream(params: {
    conditions: factory.transaction.ISearchConditions<factory.transactionType.PlaceOrder>;
    format: factory.encodingFormat.Application | factory.encodingFormat.Text;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: { transaction: TransactionRepo }): Promise<Readable> => {
        // const transactionCount = await repos.transaction.count<factory.transactionType.PlaceOrder>(params.conditions);
        // debug('transactionCount:', transactionCount);
        // if (transactionCount >= 0) {
        //     throw new Error('Too many transactions');
        // }

        let inputStream = repos.transaction.stream(params.conditions);
        let processor: Readable;

        switch (params.format) {
            case factory.encodingFormat.Application.json:
                inputStream = inputStream.map((doc) => {
                    return <any>JSON.stringify(doc.toObject());
                });

                processor = inputStream;

                break;

            case factory.encodingFormat.Text.csv:
                inputStream = inputStream.map((doc) => {
                    return <any>JSON.stringify(transaction2report({
                        transaction: doc.toObject()
                    }));
                });

                const fields: json2csv.json2csv.FieldInfo<any>[] = [
                    { label: '取引ID', default: '', value: 'id' },
                    { label: '取引ステータス', default: '', value: 'status' },
                    { label: '取引開始日時', default: '', value: 'startDate' },
                    { label: '取引終了日時', default: '', value: 'endDate' },
                    { label: '購入者タイプ', default: '', value: 'customer.typeOf' },
                    { label: '購入者ID', default: '', value: 'customer.id' },
                    { label: '購入者お名前', default: '', value: 'customer.name' },
                    { label: '購入者メールアドレス', default: '', value: 'customer.email' },
                    { label: '購入者電話番号', default: '', value: 'customer.telephone' },
                    { label: '購入者会員ID', default: '', value: 'customer.memberOf.membershipNumber' },
                    { label: '購入者トークン発行者', default: '', value: 'customer.tokenIssuer' },
                    { label: '購入者クライアント', default: '', value: 'customer.clientId' },
                    { label: '販売者タイプ', default: '', value: 'seller.typeOf' },
                    { label: '販売者ID', default: '', value: 'seller.id' },
                    { label: '販売者名', default: '', value: 'seller.name' },
                    { label: '販売者URL', default: '', value: 'seller.url' },
                    { label: '注文番号', default: '', value: 'orderNumber' },
                    { label: '確認番号', default: '', value: 'confirmationNumber' },
                    { label: '注文アイテムタイプ', default: '', value: 'items.typeOf' },
                    // { label: '注文アイテムチケット金額', default: '', value: 'items.totalPrice' },
                    { label: '注文アイテム名', default: '', value: 'items.name' },
                    { label: '注文アイテム数', default: '', value: 'items.numItems' },
                    { label: '注文アイテムイベントタイプ', default: '', value: 'items.event.typeOf' },
                    { label: '注文アイテムイベントID', default: '', value: 'items.event.id' },
                    { label: '注文アイテムイベント名', default: '', value: 'items.event.name' },
                    { label: '注文アイテムイベント開始日時', default: '', value: 'items.event.startDate' },
                    { label: '注文アイテムイベント終了日時', default: '', value: 'items.event.endDate' },
                    { label: '注文アイテムイベント場所', default: '', value: 'items.event.location' },
                    { label: '注文アイテム親イベント場所枝番号', default: '', value: 'items.event.superEventLocationBranchCode' },
                    { label: '注文アイテム親イベント場所', default: '', value: 'items.event.superEventLocation' },
                    { label: '注文金額', default: '', value: 'price' },
                    { label: '決済方法1', default: '', value: 'paymentMethodType.0' },
                    { label: '決済ID1', default: '', value: 'paymentMethodId.0' },
                    { label: '決済方法2', default: '', value: 'paymentMethodType.1' },
                    { label: '決済ID2', default: '', value: 'paymentMethodId.1' },
                    { label: '決済方法3', default: '', value: 'paymentMethodType.2' },
                    { label: '決済ID3', default: '', value: 'paymentMethodId.2' },
                    { label: '決済方法4', default: '', value: 'paymentMethodType.3' },
                    { label: '決済ID4', default: '', value: 'paymentMethodId.3' },
                    { label: '割引1', default: '', value: 'discounts.0' },
                    { label: '割引コード1', default: '', value: 'discountCodes.0' },
                    { label: '割引金額1', default: '', value: 'discountPrices.0' },
                    { label: '割引2', default: '', value: 'discounts.1' },
                    { label: '割引コード2', default: '', value: 'discountCodes.1' },
                    { label: '割引金額2', default: '', value: 'discountPrices.1' },
                    { label: '割引3', default: '', value: 'discounts.2' },
                    { label: '割引コード3', default: '', value: 'discountCodes.2' },
                    { label: '割引金額3', default: '', value: 'discountPrices.2' },
                    { label: '割引4', default: '', value: 'discounts.3' },
                    { label: '割引コード4', default: '', value: 'discountCodes.3' },
                    { label: '割引金額4', default: '', value: 'discountPrices.3' }
                    // { label: '注文状況', default: '', value: 'orderStatus' },
                    // { label: '予約チケットステータス', default: '', value: 'items.reservationStatus' },
                    // { label: '予約チケットチェックイン数', default: '', value: 'items.numCheckInActions' }
                ];

                const opts = {
                    fields: fields,
                    delimiter: ',',
                    eol: '\n',
                    // flatten: true,
                    // preserveNewLinesInValues: true,
                    unwind: 'items'
                };
                // const json2csvParser = new json2csv.Parser(opts);
                const transformOpts = {
                    highWaterMark: 16384,
                    encoding: 'utf-8'
                };
                const transform = new json2csv.Transform(opts, transformOpts);
                processor = inputStream.pipe(transform);
                break;

            default:
                throw new factory.errors.NotImplemented(`Unimplemented format: ${params.format}`);
        }

        return processor;
    };
}

// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
// tslint:disable-next-line:max-func-body-length
export function transaction2report(params: {
    order?: factory.order.IOrder;
    // ownershipInfos?: factory.ownershipInfo.IOwnershipInfo<factory.reservationType.EventReservation>[];
    // checkinActions?: factory.action.IAction<factory.action.IAttributes<any, any>>[];
    transaction: factory.transaction.placeOrder.ITransaction;
}): ITransactionReport {
    if (params.transaction.result !== undefined) {
        // 注文データがまだ存在しなければ取引結果から参照
        const order = (params.order !== undefined) ? params.order : params.transaction.result.order;
        let event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent> | undefined;
        const items = order.acceptedOffers.map(
            (orderItem) => {
                const offer = orderItem.itemOffered;
                let item = {
                    typeOf: '',
                    name: '',
                    numItems: 0,
                    event: {
                        typeOf: '',
                        id: '',
                        name: '',
                        startDate: '',
                        endDate: '',
                        location: '',
                        superEventLocationBranchCode: '',
                        superEventLocation: ''
                    }
                };

                switch (offer.typeOf) {
                    case factory.chevre.reservationType.EventReservation:
                        event = offer.reservationFor;
                        const ticket = offer.reservedTicket;
                        const ticketedSeat = ticket.ticketedSeat;
                        let name = '';
                        let numItems = 1;
                        if (ticketedSeat !== undefined) {
                            name = util.format(
                                '%s %s',
                                (offer.reservedTicket.ticketedSeat !== undefined)
                                    ? offer.reservedTicket.ticketedSeat.seatNumber
                                    : '',
                                offer.reservedTicket.ticketType.name.ja
                            );
                        }
                        if (offer.numSeats !== undefined) {
                            // tslint:disable-next-line:max-line-length
                            numItems = offer.numSeats;
                        }

                        item = {
                            typeOf: offer.typeOf,
                            name: name,
                            numItems: numItems,
                            event: {
                                typeOf: (event !== undefined) ? event.typeOf : '',
                                id: (event !== undefined) ? event.id : '',
                                name: (event !== undefined) ? event.name.ja : '',
                                startDate: (event !== undefined) ? moment(event.startDate)
                                    .toISOString() : '',
                                endDate: (event !== undefined) ? moment(event.endDate)
                                    .toISOString() : '',
                                location: (event !== undefined) ? event.location.name.ja : '',
                                superEventLocationBranchCode: (event !== undefined) ? event.superEvent.location.branchCode : '',
                                superEventLocation: (event !== undefined) ? event.superEvent.location.name.ja : ''
                            }
                        };
                        break;

                    default:
                }

                return item;
            }
        );

        return {
            id: params.transaction.id,
            status: params.transaction.status,
            startDate: (params.transaction.startDate !== undefined) ? moment(params.transaction.startDate)
                .toISOString() : '',
            endDate: (params.transaction.endDate !== undefined) ? moment(params.transaction.endDate)
                .toISOString() : '',
            seller: {
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: params.transaction.seller.name.ja,
                url: (params.transaction.seller.url !== undefined) ? params.transaction.seller.url : ''
            },
            customer: {
                typeOf: order.customer.typeOf,
                id: order.customer.id,
                name: String(order.customer.name),
                email: String(order.customer.email),
                telephone: String(order.customer.telephone),
                memberOf: order.customer.memberOf,
                tokenIssuer: (params.transaction.object.clientUser !== undefined) ? params.transaction.object.clientUser.iss : '',
                clientId: (params.transaction.object.clientUser !== undefined) ? params.transaction.object.clientUser.client_id : ''
            },
            items: items,
            orderNumber: order.orderNumber,
            // orderStatus: order.orderStatus,
            confirmationNumber: order.confirmationNumber.toString(),
            price: `${order.price} ${order.priceCurrency}`,
            paymentMethodType: order.paymentMethods.map((method) => method.typeOf),
            paymentMethodId: order.paymentMethods.map((method) => method.paymentMethodId),
            discounts: order.discounts.map((discount) => discount.name),
            discountCodes: order.discounts.map((discount) => discount.discountCode),
            discountPrices: order.discounts.map((discount) => `${discount.discount} ${discount.discountCurrency}`)
        };
    } else {
        const profile = params.transaction.agent;

        return {
            id: params.transaction.id,
            status: params.transaction.status,
            startDate: (params.transaction.startDate !== undefined) ? moment(params.transaction.startDate)
                .toISOString() : '',
            endDate: (params.transaction.endDate !== undefined) ? moment(params.transaction.endDate)
                .toISOString() : '',
            seller: {
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: params.transaction.seller.name.ja,
                url: (params.transaction.seller.url !== undefined) ? params.transaction.seller.url : ''
            },
            customer: {
                typeOf: params.transaction.agent.typeOf,
                id: params.transaction.agent.id,
                name: `${profile.familyName} ${profile.givenName}`,
                email: String(profile.email),
                telephone: String(profile.telephone),
                memberOf: {
                    membershipNumber: (params.transaction.agent.memberOf !== undefined) ?
                        params.transaction.agent.memberOf.membershipNumber :
                        ''
                },
                tokenIssuer: (params.transaction.object.clientUser !== undefined) ? params.transaction.object.clientUser.iss : '',
                clientId: (params.transaction.object.clientUser !== undefined) ? params.transaction.object.clientUser.client_id : ''
            },
            items: [],
            orderNumber: '',
            // orderStatus: '',
            confirmationNumber: '',
            price: '',
            paymentMethodType: [],
            paymentMethodId: [],
            discounts: [],
            discountCodes: [],
            discountPrices: []
        };
    }
}
