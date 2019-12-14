/**
 * Eメールメッセージビルダー
 */
import * as moment from 'moment-timezone';
import * as pug from 'pug';
import * as util from 'util';

import * as factory from './factory';

const templateDirectory = `${__dirname}/../emails`;

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type ICompoundPriceSpecification = factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

async function createEmailMessageText(params: {
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
    renderFilePath: string;
    renderFileOptions: pug.LocalsObject;
}): Promise<string> {
    const emailTemplate = (params.email !== undefined) ? params.email.template : undefined;
    const emailText = (params.email !== undefined) ? params.email.text : undefined;
    let emailMessageText: string;

    if (typeof emailText === 'string') {
        emailMessageText = emailText;
    } else if (typeof emailTemplate === 'string') {
        emailMessageText = await new Promise<string>((resolve, reject) => {
            pug.render(
                emailTemplate,
                {
                    order: params.order
                },
                (err, message) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('emailTemplate', err.message));

                        return;
                    }

                    resolve(message);
                }
            );
        });
    } else {
        emailMessageText = await new Promise<string>((resolve, reject) => {
            pug.renderFile(
                params.renderFilePath,
                params.renderFileOptions,
                (err, message) => {
                    if (err instanceof Error) {
                        reject(err);

                        return;
                    }

                    resolve(message);
                }
            );
        });
    }

    return emailMessageText;
}

async function createEmailMessageAbount(params: {
    email?: factory.creativeWork.message.email.ICustomization;
    renderFilePath: string;
    renderFileOptions: pug.LocalsObject;
}): Promise<string> {
    let about: string;

    if (params.email !== undefined && typeof params.email.about === 'string') {
        about = params.email.about;
    } else {
        about = await new Promise<string>((resolve, reject) => {
            pug.renderFile(
                params.renderFilePath,
                params.renderFileOptions,
                (err, defaultSubject) => {
                    if (err instanceof Error) {
                        reject(err);

                        return;
                    }

                    resolve(defaultSubject);
                }
            );
        });
    }

    return about;
}

/**
 * 注文配送メッセージを作成する
 */
export async function createSendOrderMessage(params: {
    project: factory.project.IProject;
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    const emailMessageText = await createEmailMessageText({
        order: params.order,
        email: params.email,
        renderFilePath: `${templateDirectory}/sendOrder/text.pug`,
        renderFileOptions: {
            order: params.order,
            orderItems: createOrderItems(params)
                .join('\n')
        }
    });

    const about = await createEmailMessageAbount({
        email: params.email,
        renderFilePath: `${templateDirectory}/sendOrder/subject.pug`,
        renderFileOptions: {
            sellerName: params.order.seller.name
        }
    });

    const defaultToRecipientEmail = params.order.customer.email;
    if (defaultToRecipientEmail === undefined) {
        throw new factory.errors.Argument('order', 'order.customer.email undefined');
    }

    const sender: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.seller.typeOf,
        name: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.name === 'string')
            ? params.email.sender.name
            : params.order.seller.name,
        email: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.email === 'string')
            ? params.email.sender.email
            : 'noreply@example.com'
    };

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        typeOf: factory.creativeWorkType.EmailMessage,
        identifier: `SendOrder-${params.order.orderNumber}`,
        name: `SendOrder-${params.order.orderNumber}`,
        sender: sender,
        toRecipient: toRecipient,
        about: about,
        text: emailMessageText
    };
}

/**
 * 注文データから注文アイテム文字列を作成する
 */
export function createOrderItems(params: {
    order: factory.order.IOrder;
    project: factory.project.IProject;
}): string[] {
    return params.order.acceptedOffers.map((o) => {
        if (o.itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const reservation = o.itemOffered;
            const event = reservation.reservationFor;
            const eventStartDate = util.format(
                '%s - %s',
                moment(event.startDate)
                    .locale('ja')
                    .tz('Asia/Tokyo')
                    .format('YYYY年MM月DD日(ddd) HH:mm'),
                moment(event.endDate)
                    .tz('Asia/Tokyo')
                    .format('HH:mm')
            );
            const locationName = util.format(
                '%s %s%s',
                event.superEvent.location.name.ja,
                event.location.name.ja,
                (event.location.address !== undefined) ? `(${event.location.address.ja})` : ''
            );

            let option = '';
            if (Array.isArray(reservation.reservationFor.superEvent.videoFormat)) {
                option += reservation.reservationFor.superEvent.videoFormat.map((format) => format.typeOf)
                    .join(',');
            }
            let priceStr = '';

            let reservationPriceSpec: ICompoundPriceSpecification | undefined;

            if (typeof o.priceSpecification === 'number') {
                // priceが数字の場合単価仕様を含む複合価格仕様に変換
                reservationPriceSpec = {
                    project: { typeOf: params.project.typeOf, id: params.project.id },
                    typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                    priceCurrency: factory.chevre.priceCurrency.JPY,
                    valueAddedTaxIncluded: true,
                    priceComponent: [
                        {
                            project: { typeOf: params.project.typeOf, id: params.project.id },
                            typeOf: factory.chevre.priceSpecificationType.UnitPriceSpecification,
                            price: o.priceSpecification,
                            priceCurrency: o.priceCurrency,
                            valueAddedTaxIncluded: true
                        }
                    ]

                };
            } else {
                reservationPriceSpec = <ICompoundPriceSpecification>o.priceSpecification;
            }

            const unitPriceSpec = <IUnitPriceSpecification>
                reservationPriceSpec.priceComponent.find(
                    (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                );
            if (unitPriceSpec !== undefined) {
                priceStr = `${unitPriceSpec.price}/${unitPriceSpec.referenceQuantity.value}`;
            }

            return util.format(
                '%s %s @%s %s %s %s %s (%s)',
                event.name.ja,
                eventStartDate,
                locationName,
                (reservation.reservedTicket.ticketedSeat !== undefined)
                    ? reservation.reservedTicket.ticketedSeat.seatNumber
                    : 'Non-reserved Seat',
                reservation.reservedTicket.ticketType.name.ja,
                priceStr,
                o.priceCurrency,
                option
            );
        } else {
            return util.format(
                '%s %s %s',
                o.itemOffered.typeOf,
                o.price,
                o.priceCurrency
            );
        }
    });
}

/**
 * 注文返品メッセージを作成する
 */
export async function createReturnOrderMessage(params: {
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    const emailMessageText = await createEmailMessageText({
        order: params.order,
        email: params.email,
        renderFilePath: `${templateDirectory}/returnOrder/text.pug`,
        renderFileOptions: {
            order: params.order
        }
    });

    const about = await createEmailMessageAbount({
        email: params.email,
        renderFilePath: `${templateDirectory}/returnOrder/subject.pug`,
        renderFileOptions: {
            sellerName: params.order.seller.name
        }
    });

    const defaultToRecipientEmail = params.order.customer.email;
    if (defaultToRecipientEmail === undefined) {
        throw new factory.errors.Argument('order', 'order.customer.email undefined');
    }

    const sender: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.seller.typeOf,
        name: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.name === 'string')
            ? params.email.sender.name
            : params.order.seller.name,
        email: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.email === 'string')
            ? params.email.sender.email
            : 'noreply@example.com'
    };

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        typeOf: factory.creativeWorkType.EmailMessage,
        identifier: `ReturnOrder-${params.order.orderNumber}`,
        name: `ReturnOrder-${params.order.orderNumber}`,
        sender: sender,
        toRecipient: toRecipient,
        about: about,
        text: emailMessageText
    };
}

/**
 * 返金メッセージを作成する
 */
export async function createRefundMessage(params: {
    order: factory.order.IOrder;
    paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[];
    email?: factory.creativeWork.message.email.ICustomization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    const emailMessageText = await createEmailMessageText({
        order: params.order,
        email: params.email,
        renderFilePath: `${templateDirectory}/refundOrder/text.pug`,
        renderFileOptions: {
            order: params.order,
            paymentMethods: params.paymentMethods.map((p) => {
                return util.format(
                    '%s\n%s\n%s\n',
                    p.typeOf,
                    (p.accountId !== undefined) ? p.accountId : '',
                    (p.totalPaymentDue !== undefined) ? `${p.totalPaymentDue.value} ${p.totalPaymentDue.currency}` : ''
                );
            })
                .join('\n')
        }
    });

    const about = await createEmailMessageAbount({
        email: params.email,
        renderFilePath: `${templateDirectory}/refundOrder/subject.pug`,
        renderFileOptions: {
            sellerName: params.order.seller.name
        }
    });

    const defaultToRecipientEmail = params.order.customer.email;
    if (defaultToRecipientEmail === undefined) {
        throw new factory.errors.Argument('order', 'order.customer.email undefined');
    }

    const sender: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.seller.typeOf,
        name: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.name === 'string')
            ? params.email.sender.name
            : params.order.seller.name,
        email: (params.email !== undefined
            && params.email.sender !== undefined
            && typeof params.email.sender.email === 'string')
            ? params.email.sender.email
            : 'noreply@example.com'
    };

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (params.email !== undefined
            && params.email.toRecipient !== undefined
            && typeof params.email.toRecipient.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        typeOf: factory.creativeWorkType.EmailMessage,
        identifier: `RefundOrder-${params.order.orderNumber}`,
        name: `RefundOrder-${params.order.orderNumber}`,
        sender: sender,
        toRecipient: toRecipient,
        about: about,
        text: emailMessageText
    };
}
