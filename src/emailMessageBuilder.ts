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

/**
 * 注文配送メッセージを作成する
 */
export async function createSendOrderMessage(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    customerContact: factory.transaction.placeOrder.ICustomerContact;
    order: factory.order.IOrder;
    seller: factory.organization.movieTheater.IOrganization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    return new Promise<factory.creativeWork.message.email.ICreativeWork>((resolve, reject) => {
        const seller = params.transaction.seller;
        if (params.order.acceptedOffers[0].itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const event = params.order.acceptedOffers[0].itemOffered.reservationFor;
            const screenName = util.format(
                '%s%s',
                event.location.name.ja,
                (event.location.address !== undefined) ? `(${event.location.address.ja})` : ''
            );
            const orderDate = moment(params.order.orderDate).locale('ja').tz('Asia/Tokyo').format('YYYY年MM月DD日(ddd) HH:mm:ss');
            const eventStartDate = util.format(
                '%s - %s',
                moment(event.startDate).locale('ja').tz('Asia/Tokyo').format('YYYY年MM月DD日(ddd) HH:mm'),
                moment(event.endDate).tz('Asia/Tokyo').format('HH:mm')
            );

            pug.renderFile(
                `${templateDirectory}/sendOrder/text.pug`,
                {
                    familyName: params.customerContact.familyName,
                    givenName: params.customerContact.givenName,
                    orderDate: orderDate,
                    orderNumber: params.order.orderNumber,
                    confirmationNumber: params.order.confirmationNumber,
                    eventStartDate: eventStartDate,
                    workPerformedName: event.workPerformed.name,
                    screenName: screenName,
                    reservedSeats: params.order.acceptedOffers.map((o) => {
                        const reservation = o.itemOffered;
                        let option = '';
                        if (Array.isArray(reservation.reservationFor.superEvent.videoFormat)) {
                            option += reservation.reservationFor.superEvent.videoFormat.map((format) => format.typeOf).join(',');
                        }

                        return util.format(
                            '%s %s %s %s (%s)',
                            reservation.reservedTicket.ticketedSeat.seatNumber,
                            reservation.reservedTicket.ticketType.name.ja,
                            reservation.price,
                            reservation.priceCurrency,
                            option
                        );
                    }).join('\n'),
                    price: params.order.price,
                    inquiryUrl: params.order.url,
                    sellerName: params.order.seller.name,
                    sellerTelephone: params.seller.telephone
                },
                (renderMessageErr, message) => {
                    if (renderMessageErr instanceof Error) {
                        reject(renderMessageErr);

                        return;
                    }

                    debug('message:', message);
                    pug.renderFile(
                        `${templateDirectory}/sendOrder/subject.pug`,
                        {
                            sellerName: params.order.seller.name
                        },
                        (renderSubjectErr, subject) => {
                            if (renderSubjectErr instanceof Error) {
                                reject(renderSubjectErr);

                                return;
                            }

                            debug('subject:', subject);

                            const email: factory.creativeWork.message.email.ICreativeWork = {
                                typeOf: factory.creativeWorkType.EmailMessage,
                                identifier: `placeOrderTransaction-${params.transaction.id}`,
                                name: `placeOrderTransaction-${params.transaction.id}`,
                                sender: {
                                    typeOf: seller.typeOf,
                                    name: seller.name.ja,
                                    email: 'noreply@example.com'
                                },
                                toRecipient: {
                                    typeOf: params.transaction.agent.typeOf,
                                    name: `${params.customerContact.familyName} ${params.customerContact.givenName}`,
                                    email: params.customerContact.email
                                },
                                about: subject,
                                text: message
                            };
                            resolve(email);
                        }
                    );
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
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    return new Promise<factory.creativeWork.message.email.ICreativeWork>((resolve, reject) => {
        pug.renderFile(
            `${templateDirectory}/refundOrder/text.pug`,
            {
                familyName: params.order.customer.familyName,
                givenName: params.order.customer.givenName,
                confirmationNumber: params.order.confirmationNumber,
                price: params.order.price,
                sellerName: params.order.seller.name,
                sellerTelephone: params.order.seller.telephone
            },
            (renderMessageErr, message) => {
                if (renderMessageErr instanceof Error) {
                    reject(renderMessageErr);

                    return;
                }

                debug('message:', message);
                pug.renderFile(
                    `${templateDirectory}/refundOrder/subject.pug`,
                    {
                        sellerName: params.order.seller.name
                    },
                    (renderSubjectErr, subject) => {
                        if (renderSubjectErr instanceof Error) {
                            reject(renderSubjectErr);

                            return;
                        }

                        debug('subject:', subject);

                        const email: factory.creativeWork.message.email.ICreativeWork = {
                            typeOf: factory.creativeWorkType.EmailMessage,
                            identifier: `refundOrder-${params.order.orderNumber}`,
                            name: `refundOrder-${params.order.orderNumber}`,
                            sender: {
                                typeOf: params.order.seller.typeOf,
                                name: params.order.seller.name,
                                email: 'noreply@example.com'
                            },
                            toRecipient: {
                                typeOf: params.order.customer.typeOf,
                                name: `${params.order.customer.familyName} ${params.order.customer.givenName}`,
                                email: params.order.customer.email
                            },
                            about: subject,
                            text: message
                        };
                        resolve(email);
                    }
                );
            }
        );
    });
}
