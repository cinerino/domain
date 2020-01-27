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

export interface ISeller {
    typeOf: string;
    id: string;
    name: string;
    url: string;
}

export interface ICustomer {
    typeOf: string;
    id: string;
    name: string;
    email: string;
    givenName: string;
    familyName: string;
    telephone: string;
    memberOf?: {
        membershipNumber?: string;
    };
    clientId: string;
    tokenIssuer: string;
    additionalProperty: string;
    identifier: string;
}

export interface IItem {
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
}

export interface IAcceptedOffer {
    typeOf: string;
    name: string;
    id: string;
    unitPriceSpecification: {
        price: String;
        priceCurrency: string;
    };
    itemOffered: IItem;
}

/**
 * 注文レポートインターフェース
 */
export interface IOrderReport {
    orderStatus: string;
    orderDate: string;
    seller: ISeller;
    customer: ICustomer;
    acceptedOffers: IAcceptedOffer[];
    orderNumber: string;
    confirmationNumber: string;
    price: string;
    paymentMethodType: string[];
    paymentMethodId: string[];
    identifier: string;
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
                    { label: '注文番号', default: '', value: 'orderNumber' },
                    { label: '確認番号', default: '', value: 'confirmationNumber' },
                    { label: '注文識別子', default: '', value: 'identifier' },
                    { label: '金額', default: '', value: 'price' },
                    { label: '購入者タイプ', default: '', value: 'customer.typeOf' },
                    { label: '購入者ID', default: '', value: 'customer.id' },
                    { label: '購入者名称', default: '', value: 'customer.name' },
                    { label: '購入者名', default: '', value: 'customer.givenName' },
                    { label: '購入者性', default: '', value: 'customer.familyName' },
                    { label: '購入者メールアドレス', default: '', value: 'customer.email' },
                    { label: '購入者電話番号', default: '', value: 'customer.telephone' },
                    { label: '購入者会員番号', default: '', value: 'customer.memberOf.membershipNumber' },
                    { label: '購入者トークン発行者', default: '', value: 'customer.tokenIssuer' },
                    { label: '購入者クライアント', default: '', value: 'customer.clientId' },
                    { label: '購入者追加特性', default: '', value: 'customer.additionalProperty' },
                    { label: '購入者識別子', default: '', value: 'customer.identifier' },
                    { label: '販売者タイプ', default: '', value: 'seller.typeOf' },
                    { label: '販売者ID', default: '', value: 'seller.id' },
                    { label: '販売者名称', default: '', value: 'seller.name' },
                    { label: '販売者URL', default: '', value: 'seller.url' },
                    { label: 'オファータイプ', default: '', value: 'acceptedOffers.typeOf' },
                    { label: 'オファーID', default: '', value: 'acceptedOffers.id' },
                    { label: 'オファー名称', default: '', value: 'acceptedOffers.name' },
                    { label: 'オファー単価仕様価格', default: '', value: 'acceptedOffers.unitPriceSpecification.price' },
                    { label: 'オファー単価仕様通貨', default: '', value: 'acceptedOffers.unitPriceSpecification.priceCurrency' },
                    { label: '注文アイテムタイプ', default: '', value: 'acceptedOffers.itemOffered.typeOf' },
                    { label: '注文アイテムID', default: '', value: 'acceptedOffers.itemOffered.id' },
                    { label: '注文アイテム名称', default: '', value: 'acceptedOffers.itemOffered.name' },
                    { label: '注文アイテム数', default: '', value: 'acceptedOffers.itemOffered.numItems' },
                    { label: '注文アイテムイベントタイプ', default: '', value: 'acceptedOffers.itemOffered.event.typeOf' },
                    { label: '注文アイテムイベントID', default: '', value: 'acceptedOffers.itemOffered.event.id' },
                    { label: '注文アイテムイベント名称', default: '', value: 'acceptedOffers.itemOffered.event.name' },
                    { label: '注文アイテムイベント開始日時', default: '', value: 'acceptedOffers.itemOffered.event.startDate' },
                    { label: '注文アイテムイベント終了日時', default: '', value: 'acceptedOffers.itemOffered.event.endDate' },
                    { label: '注文アイテムイベント場所', default: '', value: 'acceptedOffers.itemOffered.event.location' },
                    { label: '注文アイテム親イベント場所枝番号', default: '', value: 'acceptedOffers.itemOffered.event.superEventLocationBranchCode' },
                    { label: '注文アイテム親イベント場所', default: '', value: 'acceptedOffers.itemOffered.event.superEventLocation' },
                    { label: '決済方法タイプ1', default: '', value: 'paymentMethodType.0' },
                    { label: '決済ID1', default: '', value: 'paymentMethodId.0' },
                    { label: '決済方法タイプ2', default: '', value: 'paymentMethodType.1' },
                    { label: '決済ID2', default: '', value: 'paymentMethodId.1' },
                    { label: '決済方法タイプ3', default: '', value: 'paymentMethodType.2' },
                    { label: '決済ID3', default: '', value: 'paymentMethodId.2' },
                    { label: '決済方法タイプ4', default: '', value: 'paymentMethodType.3' },
                    { label: '決済ID4', default: '', value: 'paymentMethodId.3' }
                ];

                const opts = {
                    fields: fields,
                    delimiter: ',',
                    eol: '\n',
                    // flatten: true,
                    // preserveNewLinesInValues: true,
                    unwind: 'acceptedOffers'
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

export function order2report(params: {
    order: factory.order.IOrder;
}): IOrderReport {
    const order = params.order;
    let event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent> | undefined;

    const acceptedOffers: IAcceptedOffer[] = order.acceptedOffers.map(
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        (acceptedOffer) => {
            let unitPriceSpecification: { price: string; priceCurrency: string } | undefined;

            if (acceptedOffer.priceSpecification !== undefined) {
                switch (acceptedOffer.priceSpecification.typeOf) {
                    case factory.chevre.priceSpecificationType.UnitPriceSpecification:
                        const priceSpec
                            // tslint:disable-next-line:max-line-length
                            = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
                            acceptedOffer.priceSpecification;

                        unitPriceSpecification = {
                            price: (typeof priceSpec.price === 'number') ? String(priceSpec.price) : '',
                            priceCurrency: String(priceSpec.priceCurrency)
                        };

                        break;

                    case factory.chevre.priceSpecificationType.CompoundPriceSpecification:
                        const compoundPriceSpec
                            = <factory.chevre.compoundPriceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType>>
                            acceptedOffer.priceSpecification;

                        const unitPriceSpec = compoundPriceSpec.priceComponent.find(
                            (component) => component.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                        );
                        if (unitPriceSpec !== undefined) {
                            unitPriceSpecification = {
                                price: (typeof unitPriceSpec.price === 'number') ? String(unitPriceSpec.price) : '',
                                priceCurrency: String(unitPriceSpec.priceCurrency)
                            };
                        }

                        break;

                    default:
                }
            }

            const itemOffered = acceptedOffer.itemOffered;
            let item: IItem = {
                typeOf: String(itemOffered.typeOf),
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

            switch (itemOffered.typeOf) {
                case factory.chevre.reservationType.EventReservation:
                    event = itemOffered.reservationFor;
                    const ticket = itemOffered.reservedTicket;
                    const ticketedSeat = ticket.ticketedSeat;

                    let name = '';
                    let numItems = 1;

                    name = [
                        (ticketedSeat !== undefined) ? ticketedSeat.seatNumber : '',
                        itemOffered.reservedTicket.ticketType.name.ja
                    ].join(' ');

                    if (itemOffered.numSeats !== undefined) {
                        // tslint:disable-next-line:max-line-length
                        numItems = itemOffered.numSeats;
                    }

                    item = {
                        typeOf: itemOffered.typeOf,
                        name: name,
                        numItems: numItems,
                        id: itemOffered.id,
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
                        typeOf: String(itemOffered.typeOf),
                        name: (typeof itemOffered.name === 'string') ? itemOffered.name : '',
                        numItems: 1,
                        id: (typeof itemOffered.id === 'string') ? itemOffered.id : '',
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

            return {
                typeOf: acceptedOffer.typeOf,
                id: (typeof acceptedOffer.id === 'string') ? acceptedOffer.id : '',
                name: (typeof acceptedOffer.name === 'string')
                    ? acceptedOffer.name
                    : (acceptedOffer.name !== undefined && acceptedOffer.name !== null) ? acceptedOffer.name.ja : '',
                unitPriceSpecification: {
                    price: (unitPriceSpecification !== undefined) ? unitPriceSpecification.price : '',
                    priceCurrency: (unitPriceSpecification !== undefined) ? unitPriceSpecification.priceCurrency : ''
                },
                itemOffered: item
            };
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
            givenName: String(order.customer.givenName),
            familyName: String(order.customer.familyName),
            email: String(order.customer.email),
            telephone: String(order.customer.telephone),
            memberOf: order.customer.memberOf,
            clientId: (clientIdProperty !== undefined) ? clientIdProperty.value : '',
            tokenIssuer: (tokenIssuerProperty !== undefined) ? tokenIssuerProperty.value : '',
            additionalProperty: (Array.isArray(order.customer.additionalProperty)) ? JSON.stringify(order.customer.additionalProperty) : '',
            identifier: (Array.isArray(order.customer.identifier)) ? JSON.stringify(order.customer.identifier) : ''
        },
        acceptedOffers: acceptedOffers,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        confirmationNumber: order.confirmationNumber.toString(),
        price: `${order.price} ${order.priceCurrency}`,
        paymentMethodType: order.paymentMethods.map((method) => method.typeOf),
        paymentMethodId: order.paymentMethods.map((method) => method.paymentMethodId),
        identifier: (Array.isArray(order.identifier)) ? JSON.stringify(order.identifier) : ''
    };
}
