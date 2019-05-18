/**
 * Eメールメッセージビルダー
 */
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';
import * as pug from 'pug';
import * as util from 'util';

import * as factory from './factory';

const debug = createDebug('cinerino-domain:emailMessageBuilder');
const templateDirectory = `${__dirname}/../emails`;

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type ICompoundPriceSpecification = factory.chevre.compoundPriceSpecification.IPriceSpecification<any>;

/**
 * 注文配送メッセージを作成する
 */
export async function createSendOrderMessage(params: {
    project: factory.project.IProject;
    order: factory.order.IOrder;
    email?: factory.creativeWork.message.email.ICustomization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    // tslint:disable-next-line:max-func-body-length
    return new Promise<factory.creativeWork.message.email.ICreativeWork>(async (resolve, reject) => {
        if (params.order.acceptedOffers[0].itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const event = params.order.acceptedOffers[0].itemOffered.reservationFor;
            const screenName = util.format(
                '%s%s',
                event.location.name.ja,
                (event.location.address !== undefined) ? `(${event.location.address.ja})` : ''
            );
            // const orderDate = moment(params.order.orderDate).locale('ja').tz('Asia/Tokyo').format('YYYY年MM月DD日(ddd) HH:mm:ss');
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

            // テンプレートからEメールメッセージを作成
            const emailTemplate = (params.email !== undefined) ? params.email.template : undefined;
            let emailMessageText: string;
            if (emailTemplate !== undefined) {
                emailMessageText = await new Promise<string>((resolveRender) => {
                    pug.render(
                        emailTemplate,
                        {
                            order: params.order
                        },
                        (renderMessageErr, message) => {
                            if (renderMessageErr instanceof Error) {
                                reject(new factory.errors.Argument('emailTemplate', renderMessageErr.message));

                                return;
                            }

                            resolveRender(message);
                        }
                    );
                });
            } else {
                emailMessageText = await new Promise<string>((resolveRender) => {
                    pug.renderFile(
                        `${templateDirectory}/sendOrder/text.pug`,
                        {
                            order: params.order,
                            eventStartDate: eventStartDate,
                            workPerformedName: (event.workPerformed !== undefined) ? event.workPerformed.name : event.name.ja,
                            screenName: screenName,
                            reservedSeats: params.order.acceptedOffers.map((o) => {
                                const reservation = <factory.order.IReservation>o.itemOffered;
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
                                        project: params.project,
                                        typeOf: factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                                        priceCurrency: factory.chevre.priceCurrency.JPY,
                                        valueAddedTaxIncluded: true,
                                        priceComponent: [
                                            {
                                                project: params.project,
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
                                    '%s %s %s %s (%s)',
                                    (reservation.reservedTicket.ticketedSeat !== undefined)
                                        ? reservation.reservedTicket.ticketedSeat.seatNumber
                                        : '',
                                    reservation.reservedTicket.ticketType.name.ja,
                                    priceStr,
                                    o.priceCurrency,
                                    option
                                );
                            })
                                .join('\n')
                        },
                        (renderMessageErr, message) => {
                            if (renderMessageErr instanceof Error) {
                                reject(renderMessageErr);

                                return;
                            }

                            resolveRender(message);
                        }
                    );
                });
            }

            debug('emailMessageText:', emailMessageText);
            pug.renderFile(
                `${templateDirectory}/sendOrder/subject.pug`,
                {
                    sellerName: params.order.seller.name
                },
                (renderSubjectErr, defaultSubject) => {
                    if (renderSubjectErr instanceof Error) {
                        reject(renderSubjectErr);

                        return;
                    }

                    debug('defaultSubject:', defaultSubject);

                    const defaultToRecipientEmail = params.order.customer.email;
                    if (defaultToRecipientEmail === undefined) {
                        reject(new factory.errors.Argument('order', 'order.customer.email undefined'));

                        return;
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

                    const about: string = (params.email !== undefined
                        && typeof params.email.about === 'string')
                        ? params.email.about
                        : defaultSubject;

                    const email: factory.creativeWork.message.email.ICreativeWork = {
                        typeOf: factory.creativeWorkType.EmailMessage,
                        identifier: `SendOrder-${params.order.orderNumber}`,
                        name: `SendOrder-${params.order.orderNumber}`,
                        sender: sender,
                        toRecipient: toRecipient,
                        about: about,
                        text: emailMessageText
                    };

                    resolve(email);
                }
            );
        }
    });
}

/**
 * 返金メッセージを作成する
 */
export async function createRefundMessage(params: {
    order: factory.order.IOrder;
    paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[];
    email?: factory.creativeWork.message.email.ICustomization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    // tslint:disable-next-line:max-func-body-length
    return new Promise<factory.creativeWork.message.email.ICreativeWork>(async (resolve, reject) => {
        // テンプレートからEメールメッセージを作成
        const emailTemplate = (params.email !== undefined) ? params.email.template : undefined;
        let emailMessageText: string;
        if (emailTemplate !== undefined) {
            emailMessageText = await new Promise<string>((resolveRender) => {
                pug.render(
                    emailTemplate,
                    {
                        order: params.order
                    },
                    (renderMessageErr, message) => {
                        if (renderMessageErr instanceof Error) {
                            reject(new factory.errors.Argument('emailTemplate', renderMessageErr.message));

                            return;
                        }

                        resolveRender(message);
                    }
                );
            });
        } else {
            emailMessageText = await new Promise<string>((resolveRender) => {
                pug.renderFile(
                    `${templateDirectory}/refundOrder/text.pug`,
                    {
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
                    },
                    (renderMessageErr, message) => {
                        if (renderMessageErr instanceof Error) {
                            reject(renderMessageErr);

                            return;
                        }

                        debug('message:', message);
                        resolveRender(message);
                    }
                );
            });
        }

        pug.renderFile(
            `${templateDirectory}/refundOrder/subject.pug`,
            {
                sellerName: params.order.seller.name
            },
            (renderSubjectErr, defaultSubject) => {
                if (renderSubjectErr instanceof Error) {
                    reject(renderSubjectErr);

                    return;
                }

                debug('defaultSubject:', defaultSubject);

                const defaultToRecipientEmail = params.order.customer.email;
                if (defaultToRecipientEmail === undefined) {
                    reject(new factory.errors.Argument('order', 'order.customer.email undefined'));

                    return;
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

                const about: string = (params.email !== undefined
                    && typeof params.email.about === 'string')
                    ? params.email.about
                    : defaultSubject;

                const email: factory.creativeWork.message.email.ICreativeWork = {
                    typeOf: factory.creativeWorkType.EmailMessage,
                    identifier: `RefundOrder-${params.order.orderNumber}`,
                    name: `RefundOrder-${params.order.orderNumber}`,
                    sender: sender,
                    toRecipient: toRecipient,
                    about: about,
                    text: emailMessageText
                };

                resolve(email);
            }
        );
    });
}
