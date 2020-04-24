/**
 * 注文レポートサービス
 */
import * as createDebug from 'debug';
import * as json2csv from 'json2csv';
// @ts-ignore
import * as JSONStream from 'JSONStream';
import * as moment from 'moment';
import { Stream } from 'stream';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as TaskRepo } from '../../repo/task';

import { uploadFileFromStream } from '../util';

const debug = createDebug('cinerino-domain:service');

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

export interface IReport {
    project: factory.project.IProject;
    typeOf: 'Report';
    about?: string;
    reportNumber?: string;
    mentions?: {
        typeOf: 'SearchAction';
        query?: any;
        object: {
            typeOf: 'Order';
        };
    };
    dateCreated?: Date;
    dateModified?: Date;
    datePublished?: Date;
    encodingFormat?: string;
    expires?: Date;
    text?: string;
    url?: string;
}

export interface ICreateReportActionAttributes extends factory.action.IAttributes<any, IReport, any> {
    typeOf: 'CreateAction';
    // object: IReport;
    // format?: factory.encodingFormat.Application | factory.encodingFormat.Text;
    potentialActions?: {
        sendEmailMessage?: factory.action.transfer.send.message.email.IAttributes[];
    };
}

export interface ICreateReportParams {
    project: factory.project.IProject;
    object: IReport;
    // conditions: factory.order.ISearchConditions;
    // format?: factory.encodingFormat.Application | factory.encodingFormat.Text;
    potentialActions?: {
        sendEmailMessage?: {
            object?: factory.creativeWork.message.email.ICustomization;
        }[];
    };
}

export function createReport(params: ICreateReportActionAttributes) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        task: TaskRepo;
    }): Promise<void> => {
        const orderDateFrom = params.object.mentions?.query?.orderDateFrom;
        const orderDateThrough = params.object.mentions?.query?.orderDateThrough;
        const eventStartFrom = params.object.mentions?.query?.acceptedOffers?.itemOffered?.reservationFor?.startFrom;
        const eventStartThrough = params.object.mentions?.query?.acceptedOffers?.itemOffered?.reservationFor?.startThrough;

        const conditions: factory.order.ISearchConditions = {
            project: { id: { $eq: params.project.id } },
            orderDate: {
                $gte: (typeof orderDateFrom === 'string')
                    ? moment(orderDateFrom)
                        .toDate()
                    : undefined,
                $lte: (typeof orderDateThrough === 'string')
                    ? moment(orderDateThrough)
                        .toDate()
                    : undefined
            },
            acceptedOffers: {
                itemOffered: {
                    reservationFor: {
                        startFrom: (typeof eventStartFrom === 'string')
                            ? moment(eventStartFrom)
                                .toDate()
                            : undefined,
                        startThrough: (typeof eventStartThrough === 'string')
                            ? moment(eventStartThrough)
                                .toDate()
                            : undefined
                    }
                }
            }
        };

        const format = params.object.encodingFormat;
        if (typeof format !== 'string') {
            throw new factory.errors.ArgumentNull('object.encodingFormat');
        }

        // アクション開始
        const createReportActionAttributes = params;
        const report: IReport = {
            ...createReportActionAttributes.object
        };
        const action = await repos.action.start<any>({
            ...createReportActionAttributes,
            object: report
        });
        let downloadUrl: string;

        try {
            let extension: string;

            switch (params.object.encodingFormat) {
                case factory.encodingFormat.Application.json:
                    extension = 'json';
                    break;
                case factory.encodingFormat.Text.csv:
                    extension = 'csv';
                    break;

                default:
                    throw new factory.errors.Argument('object.encodingFormat', `${params.object.encodingFormat} not implemented`);
            }

            const reportStream = await stream({
                conditions,
                format: <any>format
            })(repos);

            // const bufs: Buffer[] = [];
            // const buffer = await new Promise<Buffer>((resolve, reject) => {
            //     reportStream.on('data', (chunk) => {
            //         try {
            //             if (Buffer.isBuffer(chunk)) {
            //                 bufs.push(chunk);
            //             } else {
            //                 // tslint:disable-next-line:no-console
            //                 console.info(`Received ${chunk.length} bytes of data. ${typeof chunk}`);
            //                 bufs.push(Buffer.from(chunk));
            //             }
            //         } catch (error) {
            //             reject(error);
            //         }
            //     })
            //         .on('error', (err) => {
            //             // tslint:disable-next-line:no-console
            //             console.error('createReport stream error:', err);
            //             reject(err);
            //         })
            //         .on('end', () => {
            //             resolve(Buffer.concat(bufs));
            //         })
            //         .on('finish', async () => {
            //             // tslint:disable-next-line:no-console
            //             console.info('createReport stream finished.');
            //         });
            // });

            // ブロブストレージへアップロード
            const fileName: string = (typeof createReportActionAttributes.object.about === 'string')
                ? `${createReportActionAttributes.object.about}[${params.project.id}][${moment()
                    .format('YYYYMMDDHHmmss')}].${extension}`
                : `OrderReport[${params.project.id}][${moment()
                    .format('YYYYMMDDHHmmss')}].${extension}`;
            // downloadUrl = await uploadFile({
            //     fileName: fileName,
            //     text: buffer,
            //     expiryDate: (createReportActionAttributes.object.expires !== undefined)
            //         ? moment(createReportActionAttributes.object.expires)
            //             .toDate()
            //         : undefined
            // })();
            downloadUrl = await uploadFileFromStream({
                fileName: fileName,
                text: reportStream,
                expiryDate: (createReportActionAttributes.object.expires !== undefined)
                    ? moment(createReportActionAttributes.object.expires)
                        .toDate()
                    : undefined
            })();
            debug('downloadUrl:', downloadUrl);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp<any>({ typeOf: createReportActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        report.url = downloadUrl;
        await repos.action.complete<any>({
            typeOf: createReportActionAttributes.typeOf,
            id: action.id,
            result: report
        });

        const sendEmailMessageParams = params.potentialActions?.sendEmailMessage;
        if (Array.isArray(sendEmailMessageParams)) {
            (<any>createReportActionAttributes.potentialActions).sendEmailMessage = sendEmailMessageParams.map((a) => {
                const emailText = `
レポートが使用可能です。

名称: ${report.about}
フォーマット: ${report.encodingFormat}
期限: ${report.expires}

${downloadUrl}
`;

                return {
                    project: params.project,
                    typeOf: factory.actionType.SendAction,
                    object: {
                        ...a.object,
                        text: emailText
                    },
                    // agent: createReportActionAttributes.agent,
                    recipient: createReportActionAttributes.agent,
                    potentialActions: {},
                    purpose: report
                };
            });
        }

        await onDownloaded(createReportActionAttributes)(repos);
    };
}

function onDownloaded(
    actionAttributes: ICreateReportActionAttributes
    // url: string
) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = actionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.sendEmailMessage)) {
                potentialActions.sendEmailMessage.forEach((s) => {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: s.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: s
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                });
            }

            // タスク保管
            await Promise.all(taskAttributes.map(async (taskAttribute) => {
                return repos.task.save(taskAttribute);
            }));
        }
    };
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
                        (typeof itemOffered.reservedTicket.ticketType.name === 'string')
                            ? itemOffered.reservedTicket.ticketType.name
                            : itemOffered.reservedTicket.ticketType.name?.ja
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
                            name: (typeof event.name.ja === 'string')
                                ? event.name.ja
                                : '',
                            startDate: (event !== undefined) ? moment(event.startDate)
                                .toISOString() : '',
                            endDate: (event !== undefined) ? moment(event.endDate)
                                .toISOString() : '',
                            location: (typeof event.location.name?.ja === 'string')
                                ? event.location.name.ja
                                : '',
                            superEventLocationBranchCode: (event !== undefined) ? event.superEvent.location.branchCode : '',
                            superEventLocation: (typeof event.superEvent.location.name?.ja === 'string')
                                ? event.superEvent.location.name.ja
                                : ''
                        }
                    };
                    break;

                case factory.programMembership.ProgramMembershipType.ProgramMembership:
                    item = {
                        typeOf: String(itemOffered.typeOf),
                        name: (typeof itemOffered.name === 'string') ? itemOffered.name : '',
                        numItems: 1,
                        id: (typeof (<any>itemOffered).id === 'string') ? (<any>itemOffered).id : '',
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
                    : (typeof acceptedOffer.name?.ja === 'string') ? acceptedOffer.name.ja : '',
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
