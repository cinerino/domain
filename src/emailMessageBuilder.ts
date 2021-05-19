/**
 * Eメールメッセージビルダー
 */
import * as moment from 'moment-timezone';
import * as pug from 'pug';
import * as util from 'util';

import { factory } from './factory';

const templateDirectory = `${__dirname}/../emails`;

const DEFAULT_SENDER_EMAIL = 'noreply@example.com';

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type ICompoundPriceSpecification = factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

async function createEmailMessageText(params: {
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
    renderFilePath: string;
    renderFileOptions: pug.LocalsObject;
}): Promise<string> {
    const emailTemplate = params.email?.template;
    const emailText = params.email?.text;
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

async function createEmailMessageAbout(params: {
    email?: factory.creativeWork.message.email.ICustomization;
    renderFilePath: string;
    renderFileOptions: pug.LocalsObject;
}): Promise<string> {
    let about: string;

    if (typeof params.email?.about === 'string') {
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

function createEmailMessageSender(params: {
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
}): factory.creativeWork.message.email.IParticipant {
    return {
        typeOf: params.order.seller.typeOf,
        name: (typeof params.email?.sender?.name === 'string')
            ? params.email.sender.name
            : (typeof params.order.seller.name === 'string')
                ? params.order.seller.name
                : (typeof params.order.seller.name?.ja === 'string') ? params.order.seller.name?.ja : String(params.order.seller.id),
        email: (typeof params.email?.sender?.email === 'string')
            ? params.email.sender.email
            : DEFAULT_SENDER_EMAIL
    };
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
            orderItems: createOrderItems({ order: params.order })
                .join('\n')
        }
    });

    const about = await createEmailMessageAbout({
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

    const sender = createEmailMessageSender(params);

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (typeof params.email?.toRecipient?.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (typeof params.email?.toRecipient?.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        // project: { id: params.order.project.id, typeOf: params.order.project.typeOf },
        typeOf: factory.chevre.creativeWorkType.EmailMessage,
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
}): string[] {
    return params.order.acceptedOffers.map((o) => {
        if (o.itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const reservation = <factory.order.IReservation>o.itemOffered;
            const event = reservation.reservationFor;
            const eventStartDate = util.format(
                '%s - %s',
                moment(event.startDate)
                    .toISOString(),
                moment(event.endDate)
                    .toISOString()
            );
            const locationName = util.format(
                '%s %s%s',
                event.superEvent.location.name?.ja,
                event.location.name?.ja,
                (event.location.address !== undefined) ? `(${event.location.address.ja})` : ''
            );

            let option = '';
            if (Array.isArray(reservation.reservationFor.superEvent.videoFormat)) {
                option += reservation.reservationFor.superEvent.videoFormat.map((format) => format.typeOf)
                    .join(',');
            }
            let priceStr = '';

            let reservationPriceSpec: ICompoundPriceSpecification | undefined;

            if (o.priceSpecification !== undefined && o.priceSpecification !== null) {
                if (typeof o.priceSpecification === 'number') {
                    // priceが数字の場合単価仕様を含む複合価格仕様に変換
                    reservationPriceSpec = {
                        project: { typeOf: params.order.project.typeOf, id: params.order.project.id },
                        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                        priceCurrency: factory.chevre.priceCurrency.JPY,
                        valueAddedTaxIncluded: true,
                        priceComponent: [
                            {
                                project: { typeOf: params.order.project.typeOf, id: params.order.project.id },
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
            }

            // 予約の価格仕様が分かれば、priceStrに単価をセット
            if (reservationPriceSpec !== undefined) {
                const unitPriceSpec = <IUnitPriceSpecification>
                    reservationPriceSpec.priceComponent.find(
                        (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                    );
                if (unitPriceSpec !== undefined) {
                    priceStr = `${unitPriceSpec.price}/${unitPriceSpec.referenceQuantity.value}`;
                }
            }

            return util.format(
                '%s %s @%s %s %s %s %s (%s)',
                event.name.ja,
                eventStartDate,
                locationName,
                (reservation.reservedTicket.ticketedSeat !== undefined)
                    ? reservation.reservedTicket.ticketedSeat.seatNumber
                    : 'Non-reserved Seat',
                (typeof reservation.reservedTicket.ticketType.name === 'string')
                    ? reservation.reservedTicket.ticketType.name
                    : reservation.reservedTicket.ticketType.name?.ja,
                priceStr,
                o.priceCurrency,
                option
            );
        } else {
            return util.format(
                '%s %s %s %s',
                o.itemOffered.typeOf,
                (typeof (<any>o.itemOffered).name === 'string') ? (<any>o.itemOffered).name : '',
                (typeof o.price === 'number') ? String(o.price) : '',
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

    const about = await createEmailMessageAbout({
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

    const sender = createEmailMessageSender(params);

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (typeof params.email?.toRecipient?.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (typeof params.email?.toRecipient?.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        // project: { id: params.order.project.id, typeOf: params.order.project.typeOf },
        typeOf: factory.chevre.creativeWorkType.EmailMessage,
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
    paymentMethods: factory.order.IPaymentMethod[];
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

    const about = await createEmailMessageAbout({
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

    const sender = createEmailMessageSender(params);

    const toRecipient: factory.creativeWork.message.email.IParticipant = {
        typeOf: params.order.customer.typeOf,
        name: (typeof params.email?.toRecipient?.name === 'string')
            ? params.email.toRecipient.name
            : `${params.order.customer.familyName} ${params.order.customer.givenName}`,
        email: (typeof params.email?.toRecipient?.email === 'string')
            ? params.email.toRecipient.email
            : defaultToRecipientEmail
    };

    return {
        // project: { id: params.order.project.id, typeOf: params.order.project.typeOf },
        typeOf: factory.chevre.creativeWorkType.EmailMessage,
        identifier: `RefundOrder-${params.order.orderNumber}`,
        name: `RefundOrder-${params.order.orderNumber}`,
        sender: sender,
        toRecipient: toRecipient,
        about: about,
        text: emailMessageText
    };
}
