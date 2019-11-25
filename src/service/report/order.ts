/**
 * 注文レポートサービス
 */
import * as json2csv from 'json2csv';
// @ts-ignore
import * as JSONStream from 'JSONStream';
import * as moment from 'moment';
import { Stream } from 'stream';

import * as factory from '../../factory';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as TaskRepo } from '../../repo/task';

export type ITaskAndTransactionOperation<T> = (repos: {
    order: OrderRepo;
    task: TaskRepo;
}) => Promise<T>;

/**
 * 注文レポートインターフェース
 */
export interface IOrderReport {
    orderStatus: string;
    orderDate: string;
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
        clientId: string;
        tokenIssuer: string;
    };
    items: {
        typeOf: string;
        name: string;
        numItems: number;
        id: string;
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
}

/**
 * フォーマット指定でストリーミングダウンロード
 */
export function stream(params: {
    conditions: factory.order.ISearchConditions;
    format?: factory.encodingFormat.Application | factory.encodingFormat.Text;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: { order: OrderRepo }): Promise<Stream> => {
        let inputStream = repos.order.stream(params.conditions);
        let processor: Stream;

        switch (params.format) {
            case factory.encodingFormat.Application.json:
                inputStream = inputStream.map((doc) => {
                    return doc.toObject();
                });

                processor = inputStream.pipe(JSONStream.stringify());

                break;

            case factory.encodingFormat.Text.csv:
                inputStream = inputStream.map((doc) => {
                    return <any>JSON.stringify(order2report({
                        order: doc.toObject()
                    }));
                });

                const fields: json2csv.default.FieldInfo<any>[] = [
                    { label: '注文ステータス', default: '', value: 'orderStatus' },
                    { label: '注文日時', default: '', value: 'orderDate' },
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
                    { label: '注文アイテムID', default: '', value: 'items.id' },
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
                    { label: '決済ID4', default: '', value: 'paymentMethodId.3' }
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
                inputStream = inputStream.map((doc) => {
                    return doc.toObject();
                });

                processor = inputStream;
        }

        return processor;
    };
}

// tslint:disable-next-line:max-func-body-length
export function order2report(params: {
    order: factory.order.IOrder;
}): IOrderReport {
    const order = params.order;
    let event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent> | undefined;
    const items = order.acceptedOffers.map(
        // tslint:disable-next-line:cyclomatic-complexity
        (orderItem) => {
            const offer = orderItem.itemOffered;
            let item = {
                typeOf: String(offer.typeOf),
                name: '',
                numItems: 1,
                id: '',
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

                    name = [
                        (ticketedSeat !== undefined) ? ticketedSeat.seatNumber : '',
                        offer.reservedTicket.ticketType.name.ja
                    ].join(' ');

                    if (offer.numSeats !== undefined) {
                        // tslint:disable-next-line:max-line-length
                        numItems = offer.numSeats;
                    }

                    item = {
                        typeOf: offer.typeOf,
                        name: name,
                        numItems: numItems,
                        id: offer.id,
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

                case factory.programMembership.ProgramMembershipType.ProgramMembership:
                    item = {
                        typeOf: String(offer.typeOf),
                        name: (typeof offer.name === 'string') ? offer.name : '',
                        numItems: 1,
                        id: (typeof offer.id === 'string') ? offer.id : '',
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
                    break;

                default:
            }

            return item;
        }
    );

    const customerIdentifier = (Array.isArray(order.customer.identifier)) ? order.customer.identifier : [];
    const clientIdProperty = customerIdentifier.find((p) => p.name === 'clientId');
    const tokenIssuerProperty = customerIdentifier.find((p) => p.name === 'tokenIssuer');

    return {
        orderDate: moment(order.orderDate)
            .toISOString(),
        seller: {
            typeOf: order.seller.typeOf,
            id: order.seller.id,
            name: order.seller.name,
            url: (order.seller.url !== undefined) ? order.seller.url : ''
        },
        customer: {
            typeOf: order.customer.typeOf,
            id: order.customer.id,
            name: String(order.customer.name),
            email: String(order.customer.email),
            telephone: String(order.customer.telephone),
            memberOf: order.customer.memberOf,
            clientId: (clientIdProperty !== undefined) ? clientIdProperty.value : '',
            tokenIssuer: (tokenIssuerProperty !== undefined) ? tokenIssuerProperty.value : ''
        },
        items: items,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        confirmationNumber: order.confirmationNumber.toString(),
        price: `${order.price} ${order.priceCurrency}`,
        paymentMethodType: order.paymentMethods.map((method) => method.typeOf),
        paymentMethodId: order.paymentMethods.map((method) => method.paymentMethodId)
    };
}
