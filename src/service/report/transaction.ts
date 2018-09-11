/**
 * 取引レポートサービス
 */
import * as createDebug from 'debug';
import * as json2csv from 'json2csv';
import * as util from 'util';

import * as factory from '../../factory';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引ダウンロードフォーマット
 */
export type IDownloadFormat = 'csv';

/**
 * フォーマット指定でダウンロード
 * @param conditions 検索条件
 * @param format フォーマット
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function download(
    conditions: {
        startFrom: Date;
        startThrough: Date;
    },
    format: IDownloadFormat
) {
    return async (repos: { transaction: TransactionRepo }): Promise<string> => {
        // 取引検索
        const transactions = await repos.transaction.search({ ...conditions, typeOf: factory.transactionType.PlaceOrder });
        debug('transactions:', transactions);

        // 取引ごとに詳細を検索し、csvを作成する
        const data = await Promise.all(transactions.map(async (t) => {
            if (t.status === factory.transactionStatusType.Confirmed) {
                // const orderNumber = (<factory.transaction.placeOrder.IResult>t.result).order.orderNumber;
                return transaction2report({
                    // order: orders.find((o) => o.orderNumber === orderNumber),
                    transaction: t
                });
            } else {
                return transaction2report({
                    transaction: t
                });
            }
        }));
        debug('data:', data);

        if (format === 'csv') {
            return new Promise<string>((resolve) => {
                const fields: json2csv.json2csv.FieldInfo<any>[] = [
                    { label: '取引ID', default: '', value: 'id' },
                    { label: '取引ステータス', default: '', value: 'status' },
                    { label: '取引開始日時', default: '', value: 'startDate' },
                    { label: '取引終了日時', default: '', value: 'endDate' },
                    { label: '購入者お名前', default: '', value: 'customer.name' },
                    { label: '購入者メールアドレス', default: '', value: 'customer.email' },
                    { label: '購入者電話番号', default: '', value: 'customer.telephone' },
                    { label: '購入者会員ID', default: '', value: 'customer.memberOf.membershipNumber' },
                    { label: '販売者タイプ', default: '', value: 'seller.typeOf' },
                    { label: '販売者ID', default: '', value: 'seller.id' },
                    { label: '販売者名', default: '', value: 'seller.name' },
                    { label: '販売者URL', default: '', value: 'seller.url' },
                    { label: '予約イベント名', default: '', value: 'eventName' },
                    { label: '予約イベント開始日時', default: '', value: 'eventStartDate' },
                    { label: '予約イベント終了日時', default: '', value: 'eventEndDate' },
                    { label: '予約イベント場所枝番号', default: '', value: 'superEventLocationBranchCode' },
                    { label: '予約イベント場所1', default: '', value: 'superEventLocation' },
                    { label: '予約イベント場所2', default: '', value: 'eventLocation' },
                    { label: 'アイテムタイプ', default: '', value: 'items.typeOf' },
                    { label: 'アイテムチケットトークン', default: '', value: 'items.ticketToken' },
                    { label: 'アイテムチケット金額', default: '', value: 'items.totalPrice' },
                    { label: 'アイテム名', default: '', value: 'items.name' },
                    { label: 'アイテム数', default: '', value: 'items.numItems' },
                    { label: '注文番号', default: '', value: 'orderNumber' },
                    { label: '確認番号', default: '', value: 'confirmationNumber' },
                    { label: '注文金額', default: '', value: 'price' },
                    { label: '決済方法1', default: '', value: 'paymentMethod.0' },
                    { label: '決済ID1', default: '', value: 'paymentMethodId.0' },
                    { label: '決済方法2', default: '', value: 'paymentMethod.1' },
                    { label: '決済ID2', default: '', value: 'paymentMethodId.1' },
                    { label: '決済方法3', default: '', value: 'paymentMethod.2' },
                    { label: '決済ID3', default: '', value: 'paymentMethodId.2' },
                    { label: '決済方法4', default: '', value: 'paymentMethod.3' },
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
                    { label: '割引金額4', default: '', value: 'discountPrices.3' },
                    { label: '注文状況', default: '', value: 'orderStatus' },
                    { label: '予約チケットステータス', default: '', value: 'items.reservationStatus' },
                    { label: '予約チケットチェックイン数', default: '', value: 'items.numCheckInActions' }
                ];
                const json2csvParser = new json2csv.Parser({
                    fields: fields,
                    delimiter: ',',
                    eol: '\n',
                    // flatten: true,
                    // preserveNewLinesInValues: true,
                    unwind: 'items'
                });
                const output = json2csvParser.parse(data);
                debug('output:', output);

                resolve(output);
                // resolve(jconv.convert(output, 'UTF8', 'SJIS'));
            });
        } else {
            throw new factory.errors.NotImplemented('specified format not implemented.');
        }
    };
}

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
        name: string;
        email: string;
        telephone: string;
        memberOf?: {
            membershipNumber?: string;
        };
    };
    eventName: string;
    eventStartDate: string;
    eventEndDate: string;
    superEventLocationBranchCode: string;
    superEventLocation: string;
    eventLocation: string;
    items: {
        typeOf: string;
        ticketToken: string;
        totalPrice: number;
        name: string;
        numItems: number;
        reservationStatus: string;
        numCheckInActions: number;
    }[];
    orderNumber: string;
    orderStatus: string;
    confirmationNumber: string;
    price: string;
    paymentMethod: string[];
    paymentMethodId: string[];
    discounts: string[];
    discountCodes: string[];
    discountPrices: string[];
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
        let event: factory.chevre.event.screeningEvent.IEvent | undefined;
        const items = order.acceptedOffers.map(
            (orderItem) => {
                const offer = orderItem.itemOffered;
                let item = {
                    typeOf: '',
                    ticketToken: '',
                    totalPrice: 0,
                    name: '',
                    numItems: 0,
                    reservationStatus: '',
                    numCheckInActions: 0
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
                                offer.reservedTicket.ticketedSeat.seatNumber,
                                offer.reservedTicket.ticketType.name.ja
                            );
                        }
                        if (offer.numSeats !== undefined) {
                            // tslint:disable-next-line:max-line-length
                            numItems = offer.numSeats;
                        }

                        const reservationStatus = '';
                        // if (params.ownershipInfos !== undefined) {
                        // tslint:disable-next-line:max-line-length
                        //     const ownershipInfo = params.ownershipInfos.find((i) => i.typeOfGood.reservedTicket.ticketToken === ticket.ticketToken);
                        //     if (ownershipInfo !== undefined) {
                        //         reservationStatus = ownershipInfo.typeOfGood.reservationStatus;
                        //     }
                        // }
                        const numCheckInActions = 0;
                        // if (params.checkinActions !== undefined) {
                        //     numCheckInActions = params.checkinActions.filter(
                        //         (a) => a.object.reservedTicket.ticketToken === ticket.ticketToken
                        //     ).length;
                        // }

                        item = {
                            typeOf: offer.typeOf,
                            ticketToken: (ticket.ticketToken !== undefined) ? ticket.ticketToken : '',
                            totalPrice: ticket.totalPrice,
                            name: name,
                            numItems: numItems,
                            reservationStatus: reservationStatus,
                            numCheckInActions: numCheckInActions
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
            startDate: (params.transaction.startDate !== undefined) ? params.transaction.startDate.toISOString() : '',
            endDate: (params.transaction.endDate !== undefined) ? params.transaction.endDate.toISOString() : '',
            seller: {
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: params.transaction.seller.name.ja,
                url: (params.transaction.seller.url !== undefined) ? params.transaction.seller.url : ''
            },
            customer: order.customer,
            eventName: (event !== undefined) ? event.name.ja : '',
            eventStartDate: (event !== undefined) ? event.startDate.toISOString() : '',
            eventEndDate: (event !== undefined) ? event.endDate.toISOString() : '',
            eventLocation: (event !== undefined) ? event.location.name.ja : '',
            superEventLocationBranchCode: (event !== undefined) ? event.superEvent.location.branchCode : '',
            superEventLocation: (event !== undefined) ? event.superEvent.location.name.ja : '',
            items: items,
            orderNumber: order.orderNumber,
            orderStatus: order.orderStatus,
            confirmationNumber: order.confirmationNumber.toString(),
            price: `${order.price} ${order.priceCurrency}`,
            paymentMethod: order.paymentMethods.map((method) => method.name),
            paymentMethodId: order.paymentMethods.map((method) => method.paymentMethodId),
            discounts: order.discounts.map((discount) => discount.name),
            discountCodes: order.discounts.map((discount) => discount.discountCode),
            discountPrices: order.discounts.map((discount) => `${discount.discount} ${discount.discountCurrency}`)
        };
    } else {
        const customerContact = params.transaction.object.customerContact;

        return {
            id: params.transaction.id,
            status: params.transaction.status,
            startDate: (params.transaction.startDate !== undefined) ? params.transaction.startDate.toISOString() : '',
            endDate: (params.transaction.endDate !== undefined) ? params.transaction.endDate.toISOString() : '',
            seller: {
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: params.transaction.seller.name.ja,
                url: (params.transaction.seller.url !== undefined) ? params.transaction.seller.url : ''
            },
            customer: {
                name: (customerContact !== undefined) ? `${customerContact.familyName} ${customerContact.givenName}` : '',
                email: (customerContact !== undefined) ? customerContact.email : '',
                telephone: (customerContact !== undefined) ? customerContact.telephone : '',
                memberOf: {
                    membershipNumber: (params.transaction.agent.memberOf !== undefined) ?
                        params.transaction.agent.memberOf.membershipNumber :
                        ''
                }
            },
            eventName: '',
            eventStartDate: '',
            eventEndDate: '',
            superEventLocationBranchCode: '',
            superEventLocation: '',
            eventLocation: '',
            items: [],
            orderNumber: '',
            orderStatus: '',
            confirmationNumber: '',
            price: '',
            paymentMethod: [],
            paymentMethodId: [],
            discounts: [],
            discountCodes: [],
            discountPrices: []
        };
    }
}
