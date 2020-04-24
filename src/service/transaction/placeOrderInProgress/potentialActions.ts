// import * as COA from '@motionpicture/coa-service';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment';
import { format } from 'util';

import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.monetaryAmount.IAction<factory.accountType>;
export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    // 予約確定アクション
    const confirmReservationActions = await createConfirmReservationActions(params);

    // 通貨転送アクション
    const moneyTransferActions = await createMoneyTransferActions(params);

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions = createRegisterProgramMembershipActions(params);

    // クレジットカード決済アクション
    const payCreditCardActions = await createPayCreditCardActions(params);

    // 口座決済アクション
    const payAccountActions = await createPayAccountActions(params);

    // ムビチケ決済アクション
    const payMovieTicketActions = await createPayMovieTicketActions(params);

    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
    const givePointAwardActions = await createGivePointAwardActions(params);

    // 注文配送メール送信設定
    const sendEmailMessageActions = await createSendEmailMessageActions(params);

    // 注文通知アクション
    const informOrderActionsOnPlaceOrder = await createInformOrderOnPlacedActions(params);
    const informOrderActionsOnSentOrder = await createInformOrderOnSentActions(params);

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        project: params.transaction.project,
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            confirmReservation: confirmReservationActions,
            informOrder: informOrderActionsOnSentOrder,
            moneyTransfer: moneyTransferActions,
            registerProgramMembership: registerProgramMembershipActions,
            sendEmailMessage: sendEmailMessageActions
        }
    };

    return {
        order: {
            project: params.transaction.project,
            typeOf: factory.actionType.OrderAction,
            object: params.order,
            agent: params.transaction.agent,
            potentialActions: {
                givePointAward: givePointAwardActions,
                informOrder: informOrderActionsOnPlaceOrder,
                payAccount: payAccountActions,
                payCreditCard: payCreditCardActions,
                payMovieTicket: payMovieTicketActions,
                sendOrder: sendOrderActionAttributes
            },
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        }
    };
}

async function createInformOrderOnPlacedActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnPlaceOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (Array.isArray(params.potentialActions.order.potentialActions.informOrder)) {
                    params.potentialActions.order.potentialActions.informOrder.forEach((a) => {
                        if (a.recipient !== undefined) {
                            if (typeof a.recipient.url === 'string') {
                                informOrderActionsOnPlaceOrder.push({
                                    agent: params.transaction.seller,
                                    object: params.order,
                                    project: params.transaction.project,
                                    // purpose: params.transaction,
                                    recipient: {
                                        id: params.transaction.agent.id,
                                        name: params.transaction.agent.name,
                                        typeOf: params.transaction.agent.typeOf,
                                        url: a.recipient.url
                                    },
                                    typeOf: factory.actionType.InformAction
                                });
                            }
                        }
                    });
                }
            }
        }
    }

    // 取引に注文ステータス変更時イベントの指定があれば設定
    if (params.transaction.object !== undefined && params.transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(params.transaction.object.onOrderStatusChanged.informOrder)) {
            const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[]
                = params.transaction.object.onOrderStatusChanged.informOrder.map(
                    (a) => {
                        return {
                            agent: params.transaction.seller,
                            object: params.order,
                            project: params.transaction.project,
                            // purpose: params.transaction,
                            recipient: {
                                id: params.transaction.agent.id,
                                name: params.transaction.agent.name,
                                typeOf: params.transaction.agent.typeOf,
                                ...a.recipient
                            },
                            typeOf: factory.actionType.InformAction
                        };
                    }
                );

            informOrderActionsOnPlaceOrder.push(...informOrderActionAttributes);
        }
    }

    return informOrderActionsOnPlaceOrder;
}

async function createInformOrderOnSentActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnSentOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (params.potentialActions.order.potentialActions.sendOrder !== undefined) {
                    if (params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined) {
                        if (Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder)) {
                            params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder.forEach((a) => {
                                if (a.recipient !== undefined) {
                                    if (typeof a.recipient.url === 'string') {
                                        informOrderActionsOnSentOrder.push({
                                            agent: params.transaction.seller,
                                            object: params.order,
                                            project: params.transaction.project,
                                            // purpose: params.transaction,
                                            recipient: {
                                                id: params.transaction.agent.id,
                                                name: params.transaction.agent.name,
                                                typeOf: params.transaction.agent.typeOf,
                                                url: a.recipient.url
                                            },
                                            typeOf: factory.actionType.InformAction
                                        });
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    // 取引に注文ステータス変更時イベントの指定があれば設定
    if (params.transaction.object !== undefined && params.transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(params.transaction.object.onOrderStatusChanged.informOrder)) {
            const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[]
                = params.transaction.object.onOrderStatusChanged.informOrder.map(
                    (a) => {
                        return {
                            agent: params.transaction.seller,
                            object: params.order,
                            project: params.transaction.project,
                            // purpose: params.transaction,
                            recipient: {
                                id: params.transaction.agent.id,
                                name: params.transaction.agent.name,
                                typeOf: params.transaction.agent.typeOf,
                                ...a.recipient
                            },
                            typeOf: factory.actionType.InformAction
                        };
                    }
                );

            informOrderActionsOnSentOrder.push(...informOrderActionAttributes);
        }
    }

    return informOrderActionsOnSentOrder;
}

async function createSendEmailMessageActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.send.message.email.IAttributes[]> {
    // 注文配送メール送信設定
    const sendEmailMessageActions: factory.action.transfer.send.message.email.IAttributes[] = [];

    const project: factory.project.IProject = params.transaction.project;

    if (params.potentialActions !== undefined
        && params.potentialActions.order !== undefined
        && params.potentialActions.order.potentialActions !== undefined
        && params.potentialActions.order.potentialActions.sendOrder !== undefined
        && params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage)) {
        await Promise.all(
            params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage.map(async (s) => {
                const emailMessage = await emailMessageBuilder.createSendOrderMessage({
                    project: project,
                    order: params.order,
                    email: s.object
                });

                sendEmailMessageActions.push({
                    project: params.transaction.project,
                    typeOf: factory.actionType.SendAction,
                    object: emailMessage,
                    agent: params.transaction.seller,
                    recipient: params.transaction.agent,
                    potentialActions: {},
                    purpose: {
                        typeOf: params.order.typeOf,
                        seller: params.order.seller,
                        customer: params.order.customer,
                        confirmationNumber: params.order.confirmationNumber,
                        orderNumber: params.order.orderNumber,
                        price: params.order.price,
                        priceCurrency: params.order.priceCurrency,
                        orderDate: params.order.orderDate
                    }
                });
            })
        );
    }

    return sendEmailMessageActions;
}

async function createGivePointAwardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.give.pointAward.IAttributes[]> {
    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
    const pointAwardAuthorizeActions =
        (<factory.action.authorize.award.point.IAction[]>params.transaction.object.authorizeActions)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);

    return pointAwardAuthorizeActions.map((a) => {
        const actionResult = <factory.action.authorize.award.point.IResult>a.result;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            object: {
                typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                pointTransaction: actionResult.pointTransaction,
                pointAPIEndpoint: actionResult.pointAPIEndpoint
            },
            purpose: {
                project: params.order.project,
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
        };
    });
}

async function createPayMovieTicketActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[]> {
    // ムビチケ決済アクション
    const payMovieTicketActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];

    // ムビチケ着券は、注文単位でまとめて実行しないと失敗するので注意
    const authorizeMovieTicketActions = <factory.action.authorize.paymentMethod.movieTicket.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.MovieTicket)
            // PaymentDueステータスのアクションのみ、着券アクションをセット
            // 着券済の場合は、PaymentCompleteステータス
            .filter((a) => {
                const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

                return result.paymentStatus === factory.paymentStatusType.PaymentDue;
            });

    if (authorizeMovieTicketActions.length > 0) {
        payMovieTicketActions.push({
            project: params.transaction.project,
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: authorizeMovieTicketActions
                .map((a) => {
                    const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

                    return {
                        typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                        paymentMethod: {
                            accountId: result.accountId,
                            additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                            name: result.name,
                            paymentMethodId: result.paymentMethodId,
                            totalPaymentDue: result.totalPaymentDue,
                            typeOf: <factory.paymentMethodType.MovieTicket>result.paymentMethod
                        },
                        movieTickets: a.object.movieTickets
                    };
                }),
            agent: params.transaction.agent,
            purpose: {
                project: params.order.project,
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
        });
    }

    return payMovieTicketActions;
}

async function createPayAccountActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[]> {
    // 口座決済アクション
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);

    return authorizeAccountActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: [{
                typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                paymentMethod: {
                    accountId: result.accountId,
                    additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                    name: result.name,
                    paymentMethodId: result.paymentMethodId,
                    totalPaymentDue: result.totalPaymentDue,
                    typeOf: <factory.paymentMethodType.Account>result.paymentMethod
                },
                pendingTransaction:
                    (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
            }],
            agent: params.transaction.agent,
            purpose: {
                project: params.order.project,
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
        };
    });
}

async function createPayCreditCardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[]> {
    // クレジットカード決済アクション
    const payCreditCardActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] = [];

    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);

    authorizeCreditCardActions.forEach((a) => {
        const result = <factory.action.authorize.paymentMethod.creditCard.IResult>a.result;
        if (result.paymentStatus === factory.paymentStatusType.PaymentDue) {
            payCreditCardActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: <factory.paymentMethodType.CreditCard>result.paymentMethod
                    },
                    price: result.amount,
                    priceCurrency: factory.priceCurrency.JPY,
                    entryTranArgs: result.entryTranArgs,
                    execTranArgs: result.execTranArgs
                }],
                agent: params.transaction.agent,
                purpose: {
                    project: params.order.project,
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                }
            });
        }
    });

    return payCreditCardActions;
}

async function createConfirmReservationActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[]> {
    // 予約確定アクション
    const confirmReservationActions: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[] = [];

    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // tslint:disable-next-line:max-func-body-length
    seatReservationAuthorizeActions.forEach((a) => {
        const actionResult = a.result;

        if (a.instrument === undefined) {
            a.instrument = {
                typeOf: 'WebAPI',
                identifier: factory.service.webAPI.Identifier.Chevre
            };
        }

        if (actionResult !== undefined) {
            const requestBody = actionResult.requestBody;
            let responseBody = actionResult.responseBody;

            switch (a.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;
                    const price = Number(actionResult.price);
                    const acceptedOffers = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4COA[]>a.object.acceptedOffer;
                    const customer = params.order.customer;

                    const updTmpReserveSeatArgs = requestBody;
                    const updTmpReserveSeatResult = responseBody;

                    // 電話番号のフォーマットを日本人にリーダブルに調整(COAではこのフォーマットで扱うので)
                    const phoneUtil = PhoneNumberUtil.getInstance();
                    const phoneNumber = phoneUtil.parse(customer.telephone, 'JP');
                    let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);

                    // COAでは数字のみ受け付けるので数字以外を除去
                    telNum = telNum.replace(/[^\d]/g, '');

                    const mailAddr = customer.email;
                    if (mailAddr === undefined) {
                        throw new factory.errors.Argument('order', 'order.customer.email undefined');
                    }

                    const updReserveArgs: factory.action.interact.confirm.reservation.IObject4COA = {
                        theaterCode: updTmpReserveSeatArgs.theaterCode,
                        dateJouei: updTmpReserveSeatArgs.dateJouei,
                        titleCode: updTmpReserveSeatArgs.titleCode,
                        titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                        timeBegin: updTmpReserveSeatArgs.timeBegin,
                        tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum,
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveName: format('%s　%s', customer.familyName, customer.givenName),
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveNameJkana: format('%s　%s', customer.familyName, customer.givenName),
                        telNum: telNum,
                        mailAddr: mailAddr,
                        reserveAmount: price, // デフォルトのpriceCurrencyがJPYなのでこれでよし
                        listTicket: acceptedOffers.map((o) => o.ticketInfo)
                    };

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: updReserveArgs,
                        agent: params.transaction.agent,
                        purpose: {
                            project: params.order.project,
                            typeOf: params.order.typeOf,
                            seller: params.order.seller,
                            customer: params.order.customer,
                            confirmationNumber: params.order.confirmationNumber,
                            orderNumber: params.order.orderNumber,
                            price: params.order.price,
                            priceCurrency: params.order.priceCurrency,
                            orderDate: params.order.orderDate
                        },
                        instrument: a.instrument
                    });

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                    const confirmReservationObject = createConfirmReservationActionObject({
                        order: params.order,
                        potentialActions: params.potentialActions,
                        transaction: params.transaction,
                        reserveTransaction: reserveTransaction
                    });

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: confirmReservationObject,
                        agent: params.transaction.agent,
                        purpose: {
                            project: params.order.project,
                            typeOf: params.order.typeOf,
                            seller: params.order.seller,
                            customer: params.order.customer,
                            confirmationNumber: params.order.confirmationNumber,
                            orderNumber: params.order.orderNumber,
                            price: params.order.price,
                            priceCurrency: params.order.priceCurrency,
                            orderDate: params.order.orderDate
                        },
                        instrument: a.instrument
                    });
            }
        }
    });

    return confirmReservationActions;
}

// tslint:disable-next-line:max-func-body-length
function createConfirmReservationActionObject(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
    reserveTransaction: factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>;
}): factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> {
    // let confirmReservationParams: factory.transaction.placeOrder.IConfirmReservationParams[] = [];
    let confirmReservationParams
        = params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.confirmReservation;
    if (!Array.isArray(confirmReservationParams)) {
        confirmReservationParams = [];
    }

    const order = params.order;
    const customer = order.customer;
    const paymentMethodNames = order.paymentMethods.map((p) => String(p.name))
        .join(',');

    const defaultUnderNameIdentifiers: factory.propertyValue.IPropertyValue<string>[]
        = [
            ...(Array.isArray(order.identifier)) ? order.identifier : [],
            { name: 'orderNumber', value: order.orderNumber },
            // { name: 'customerGroup', value: 'Customer' },
            // { name: 'paymentNo', value: params.paymentNo },
            { name: 'transaction', value: params.transaction.id },
            // { name: 'gmoOrderId', value: params.gmoOrderId },
            { name: 'paymentMethod', value: paymentMethodNames },
            ...(typeof customer.age === 'string')
                ? [{ name: 'age', value: customer.age }]
                : [],
            ...(Array.isArray(customer.identifier)) ? customer.identifier : [],
            ...(typeof customer.memberOf?.membershipNumber === 'string')
                ? [{ name: 'username', value: customer.memberOf?.membershipNumber }]
                : []
        ];

    const confirmReservationObject:
        factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> = {
        typeOf: factory.chevre.transactionType.Reserve,
        id: params.reserveTransaction.id,
        object: {
            reservations: (Array.isArray(params.reserveTransaction.object.reservations))
                ? params.reserveTransaction.object.reservations.map((r, index) => {
                    // 購入者や販売者の情報を連携する
                    return {
                        id: r.id,
                        additionalProperty: [
                            { name: 'paymentSeatIndex', value: index.toString() }
                        ],
                        reservedTicket: {
                            issuedBy: {
                                typeOf: order.seller.typeOf,
                                name: order.seller.name
                            }
                        },
                        underName: {
                            ...order.customer,
                            // typeOf: params.order.customer.typeOf,
                            // id: params.order.customer.id,
                            name: String(params.order.customer.name),
                            // familyName: params.order.customer.familyName,
                            // givenName: params.order.customer.givenName,
                            // email: params.order.customer.email,
                            // telephone: params.order.customer.telephone,
                            identifier: defaultUnderNameIdentifiers
                        }
                    };
                })
                : []
        }
    };

    const confirmReservationObjectParams = confirmReservationParams.find((p) => {
        const object = <factory.action.interact.confirm.reservation.IObject4Chevre>p.object;

        return object !== undefined
            && object.typeOf === factory.chevre.transactionType.Reserve
            && object.id === params.reserveTransaction.id;
    });

    // 予約確定パラメータの指定があれば上書きする
    if (confirmReservationObjectParams !== undefined) {
        const customizedConfirmReservationObject =
            <factory.action.interact.confirm.reservation.IObject4Chevre>confirmReservationObjectParams.object;

        // 予約取引確定オブジェクトの指定があれば上書き
        if (customizedConfirmReservationObject.object !== undefined) {
            if (Array.isArray(customizedConfirmReservationObject.object.reservations)) {
                customizedConfirmReservationObject.object.reservations.forEach((r) => {
                    if (r.underName !== undefined && Array.isArray(r.underName.identifier)) {
                        r.underName.identifier.push(...defaultUnderNameIdentifiers);
                    }

                    if (r.reservedTicket !== undefined
                        && r.reservedTicket.underName !== undefined
                        && Array.isArray(r.reservedTicket.underName.identifier)) {
                        r.reservedTicket.underName.identifier.push(...defaultUnderNameIdentifiers);
                    }
                });
            }

            confirmReservationObject.object = customizedConfirmReservationObject.object;
        }

        // 予約取引確定後アクションの指定があれば上書き
        const informReservationParams
            = customizedConfirmReservationObject.potentialActions?.reserve?.potentialActions?.informReservation;
        if (Array.isArray(informReservationParams)) {
            confirmReservationObject.potentialActions = {
                reserve: {
                    potentialActions: {
                        informReservation: informReservationParams
                    }
                }
            };
        }
    }

    return confirmReservationObject;
}

async function createMoneyTransferActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.moneyTransfer.IAttributes<factory.accountType>[]> {
    const moneyTransferActions: factory.action.transfer.moneyTransfer.IAttributes<factory.accountType>[] = [];

    const authorizeMoneyTransferActions = (<IAuthorizeMoneyTransferOffer[]>params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');

    const paymentMethod = params.order.paymentMethods[0];
    authorizeMoneyTransferActions.forEach((a) => {
        const actionResult = a.result;
        const pendingTransaction = a.object.pendingTransaction;

        if (actionResult !== undefined && pendingTransaction !== undefined) {
            moneyTransferActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.MoneyTransfer>factory.actionType.MoneyTransfer,
                object: {
                    pendingTransaction: actionResult.responseBody
                },
                agent: params.transaction.agent,
                recipient: a.recipient,
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: Number(a.object.itemOffered.value),
                    currency: pendingTransaction.object.toLocation.accountType
                },
                fromLocation: (paymentMethod !== undefined)
                    ? {
                        accountId: paymentMethod.accountId,
                        typeOf: paymentMethod.typeOf,
                        name: paymentMethod.name,
                        paymentMethodId: paymentMethod.paymentMethodId,
                        additionalProperty: paymentMethod.additionalProperty
                    }
                    : {
                        typeOf: params.transaction.agent.typeOf,
                        id: params.transaction.agent.id,
                        name: params.transaction.agent.name
                    },
                toLocation: pendingTransaction.object.toLocation,
                purpose: {
                    project: params.order.project,
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                },
                ...(typeof actionResult.responseBody.object.description === 'string')
                    ? { description: actionResult.responseBody.object.description }
                    : {}
            });
        }
    });

    return moneyTransferActions;
}

function createRegisterProgramMembershipActions(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): factory.action.interact.register.programMembership.IAttributes[] {
    const project: factory.project.IProject = params.transaction.project;

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions: factory.action.interact.register.programMembership.IAttributes[] = [];
    const programMembershipOffers = <factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>[]>
        params.order.acceptedOffers.filter(
            (o) => o.itemOffered.typeOf === factory.programMembership.ProgramMembershipType.ProgramMembership
        );
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipOffers.length > 0) {
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        registerProgramMembershipActions.push(...programMembershipOffers.map((o) => {
            const programMembership = o.itemOffered;

            // 会員プログラム更新時のメール送信アクション
            let sendEmailMessageOnUpdate: factory.transaction.placeOrder.ISendEmailMessageParams[] = [];

            if (Array.isArray(params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.registerProgramMembership)) {
                const registerParams =
                    params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.registerProgramMembership.find((r) => {
                        return r.object !== undefined
                            && r.object.membershipFor?.id === programMembership.membershipFor?.id
                            && r.object.typeOf === programMembership.typeOf;
                    });
                if (registerParams !== undefined) {
                    const registerPotentialActions = registerParams.potentialActions;
                    if (registerPotentialActions?.orderProgramMembership?.potentialActions?.order !== undefined) {
                        const orderProgramMembershipPotentialActions =
                            registerPotentialActions.orderProgramMembership.potentialActions.order.potentialActions;
                        const sendEmailMessageOnSentParams =
                            orderProgramMembershipPotentialActions?.sendOrder?.potentialActions?.sendEmailMessage;
                        if (Array.isArray(sendEmailMessageOnSentParams)) {
                            sendEmailMessageOnUpdate = sendEmailMessageOnSentParams;
                        }
                    }
                }
            }

            // 次回の会員プログラム注文確定後アクションを設定
            const updateProgramMembershipPotentialActions: factory.transaction.placeOrder.IPotentialActionsParams = {
                order: {
                    potentialActions: {
                        sendOrder: {
                            potentialActions: {
                                registerProgramMembership: [
                                    {
                                        object: { typeOf: programMembership.typeOf, membershipFor: programMembership.membershipFor },
                                        potentialActions: {
                                            orderProgramMembership: {
                                                potentialActions: {
                                                    order: {
                                                        potentialActions: {
                                                            sendOrder: {
                                                                potentialActions: {
                                                                    sendEmailMessage: sendEmailMessageOnUpdate
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ],
                                sendEmailMessage: sendEmailMessageOnUpdate
                            }
                        }
                    }
                }
            };

            // 次回の会員プログラム注文タスクを生成
            const orderProgramMembershipTaskData: factory.task.IData<factory.taskName.OrderProgramMembership> = {
                agent: params.transaction.agent,
                object: o,
                potentialActions: updateProgramMembershipPotentialActions,
                project: project,
                typeOf: factory.actionType.OrderAction
            };

            // どういう期間でいくらのオファーなのか
            const eligibleDuration = o.eligibleDuration;
            if (eligibleDuration === undefined) {
                throw new factory.errors.NotFound('Order.acceptedOffers.eligibleDuration');
            }
            // 期間単位としては秒のみ実装
            if (eligibleDuration.unitCode !== factory.unitCode.Sec) {
                throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for eligibleDuration.unitCode ');
            }
            // プログラム更新日時は、今回のプログラムの所有期限
            const runsAt = moment(params.order.orderDate)
                .add(eligibleDuration.value, 'seconds')
                .toDate();

            const orderProgramMembershipTask: factory.task.IAttributes<factory.taskName.OrderProgramMembership> = {
                data: orderProgramMembershipTaskData,
                executionResults: [],
                name: <factory.taskName.OrderProgramMembership>factory.taskName.OrderProgramMembership,
                numberOfTried: 0,
                project: project,
                remainingNumberOfTries: 10,
                runsAt: runsAt,
                status: factory.taskStatus.Ready
            };

            return {
                agent: params.transaction.agent,
                object: {
                    typeOf: programMembership.typeOf,
                    // id: programMembership.id,
                    hostingOrganization: programMembership.hostingOrganization,
                    name: programMembership.name,
                    programName: programMembership.programName,
                    project: programMembership.project,
                    membershipFor: programMembership.membershipFor
                },
                potentialActions: {
                    orderProgramMembership: [orderProgramMembershipTask]
                },
                project: project,
                purpose: {
                    typeOf: params.order.typeOf,
                    orderNumber: params.order.orderNumber
                },
                typeOf: <factory.actionType.RegisterAction>factory.actionType.RegisterAction
            };
        }));
    }

    return registerProgramMembershipActions;
}
