import * as COA from '@motionpicture/coa-service';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment';

import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

/**
 * 取引のポストアクションを作成する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function createPotentialActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    const project: factory.project.IProject = params.transaction.project;

    // 予約確定アクション
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
    const confirmReservationActions: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[] = [];
    let confirmReservationParams: factory.transaction.placeOrder.IConfirmReservationParams[] = [];
    if (params.potentialActions !== undefined
        && params.potentialActions.order !== undefined
        && params.potentialActions.order.potentialActions !== undefined
        && params.potentialActions.order.potentialActions.sendOrder !== undefined
        && params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.confirmReservation)) {
        confirmReservationParams =
            params.potentialActions.order.potentialActions.sendOrder.potentialActions.confirmReservation;
    }

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

                    const updTmpReserveSeatArgs = requestBody;
                    const updTmpReserveSeatResult = responseBody;

                    // 電話番号のフォーマットを日本人にリーダブルに調整(COAではこのフォーマットで扱うので)
                    const phoneUtil = PhoneNumberUtil.getInstance();
                    const phoneNumber = phoneUtil.parse(params.order.customer.telephone, 'JP');
                    let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);

                    // COAでは数字のみ受け付けるので数字以外を除去
                    telNum = telNum.replace(/[^\d]/g, '');

                    const mailAddr = params.order.customer.email;
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
                        reserveName: `${params.order.customer.familyName}　${params.order.customer.givenName}`,
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveNameJkana: `${params.order.customer.familyName}　${params.order.customer.givenName}`,
                        telNum: telNum,
                        mailAddr: mailAddr,
                        reserveAmount: params.order.price, // デフォルトのpriceCurrencyがJPYなのでこれでよし
                        listTicket: params.order.acceptedOffers.map(
                            // tslint:disable-next-line:max-line-length
                            (offer) => {
                                const itemOffered = <factory.order.IReservation>offer.itemOffered;

                                let coaTicketInfo: COA.services.reserve.IUpdReserveTicket | undefined;
                                if (itemOffered.reservedTicket.coaTicketInfo !== undefined) {
                                    coaTicketInfo = itemOffered.reservedTicket.coaTicketInfo;
                                } else {
                                    const additionalProperty = itemOffered.reservedTicket.ticketType.additionalProperty;
                                    if (additionalProperty === undefined) {
                                        throw new factory.errors.NotFound('ticketType.additionalProperty');
                                    }

                                    const coaInfoProperty = additionalProperty.find((p) => p.name === 'coaInfo');
                                    if (coaInfoProperty === undefined) {
                                        throw new factory.errors.NotFound('coaInfo');
                                    }

                                    coaTicketInfo = JSON.parse(coaInfoProperty.value);
                                }

                                if (coaTicketInfo === undefined) {
                                    throw new factory.errors.NotFound('COA Ticket Info');
                                }

                                return coaTicketInfo;
                            }
                        )
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
                    // responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    // tslint:disable-next-line:max-line-length
                    const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    const defaultUnderNameIdentifiers: factory.propertyValue.IPropertyValue<string>[]
                        = [{ name: 'orderNumber', value: params.order.orderNumber }];

                    const confirmReservationObject:
                        factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> = {
                        typeOf: factory.chevre.transactionType.Reserve,
                        id: reserveTransaction.id,
                        object: {
                            reservations: reserveTransaction.object.reservations.map((r) => {
                                // 購入者や販売者の情報を連携する
                                return {
                                    id: r.id,
                                    reservedTicket: {
                                        issuedBy: {
                                            typeOf: params.order.seller.typeOf,
                                            name: params.order.seller.name
                                        }
                                    },
                                    underName: {
                                        typeOf: params.order.customer.typeOf,
                                        id: params.order.customer.id,
                                        name: String(params.order.customer.name),
                                        familyName: params.order.customer.familyName,
                                        givenName: params.order.customer.givenName,
                                        email: params.order.customer.email,
                                        telephone: params.order.customer.telephone,
                                        identifier: defaultUnderNameIdentifiers
                                    }
                                };
                            })
                        }
                    };

                    const confirmReservationObjectParams = confirmReservationParams.find((p) => {
                        const object = <factory.action.interact.confirm.reservation.IObject4Chevre>p.object;

                        return object !== undefined
                            && object.typeOf === factory.chevre.transactionType.Reserve
                            && object.id === reserveTransaction.id;
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
                        const confirmReservePotentialActions = customizedConfirmReservationObject.potentialActions;
                        if (confirmReservePotentialActions !== undefined
                            && confirmReservePotentialActions.reserve !== undefined
                            && confirmReservePotentialActions.reserve.potentialActions !== undefined
                            && Array.isArray(confirmReservePotentialActions.reserve.potentialActions.informReservation)) {
                            confirmReservationObject.potentialActions = {
                                reserve: {
                                    potentialActions: {
                                        informReservation: confirmReservePotentialActions.reserve.potentialActions.informReservation
                                    }
                                }
                            };
                        }
                    }

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

    // クレジットカード支払いアクション
    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);
    const payCreditCardActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] = [];
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

    // 口座支払いアクション
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);
    const payAccountActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[] =
        authorizeAccountActions.map((a) => {
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

    // ムビチケ決済アクション
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
    const payMovieTicketActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
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

    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
    let givePointAwardActions: factory.action.transfer.give.pointAward.IAttributes[] = [];
    const pointAwardAuthorizeActions =
        (<factory.action.authorize.award.point.IAction[]>params.transaction.object.authorizeActions)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);
    givePointAwardActions = pointAwardAuthorizeActions.map((a) => {
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

    // 注文配送メール送信設定
    const sendEmailMessageActions: factory.action.transfer.send.message.email.IAttributes[] = [];
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

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions = createRegisterProgramMembershipActions(params);

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

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        project: params.transaction.project,
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            confirmReservation: confirmReservationActions,
            informOrder: informOrderActionsOnSentOrder,
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

// tslint:disable-next-line:max-func-body-length
export function createRegisterProgramMembershipActions(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): factory.action.interact.register.programMembership.IAttributes[] {
    const project: factory.project.IProject = params.transaction.project;

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions: factory.action.interact.register.programMembership.IAttributes[] = [];
    const programMembershipOffers = <factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>[]>
        params.order.acceptedOffers.filter(
            (o) => o.itemOffered.typeOf === <factory.programMembership.ProgramMembershipType>'ProgramMembership'
        );
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipOffers.length > 0) {
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        registerProgramMembershipActions.push(...programMembershipOffers.map((o) => {
            const programMembership = o.itemOffered;

            // 会員プログラム更新時のメール送信アクション
            let sendEmailMessageOnUpdate: factory.transaction.placeOrder.ISendEmailMessageParams[] = [];

            if (params.potentialActions !== undefined
                && params.potentialActions.order !== undefined
                && params.potentialActions.order.potentialActions !== undefined
                && params.potentialActions.order.potentialActions.sendOrder !== undefined
                && params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined
                && Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.registerProgramMembership)) {
                const registerParams =
                    params.potentialActions.order.potentialActions.sendOrder.potentialActions.registerProgramMembership.find((r) => {
                        return r.object !== undefined
                            && r.object.id === programMembership.id
                            && r.object.typeOf === programMembership.typeOf;
                    });
                if (registerParams !== undefined) {
                    const registerPotentialActions = registerParams.potentialActions;
                    if (registerPotentialActions !== undefined
                        && registerPotentialActions.orderProgramMembership !== undefined
                        && registerPotentialActions.orderProgramMembership.potentialActions !== undefined
                        && registerPotentialActions.orderProgramMembership.potentialActions.order !== undefined) {
                        const orderProgramMembershipPotentialActions =
                            registerPotentialActions.orderProgramMembership.potentialActions.order.potentialActions;
                        if (orderProgramMembershipPotentialActions !== undefined
                            && orderProgramMembershipPotentialActions.sendOrder !== undefined
                            && orderProgramMembershipPotentialActions.sendOrder.potentialActions !== undefined
                            && Array.isArray(orderProgramMembershipPotentialActions.sendOrder.potentialActions.sendEmailMessage)) {
                            sendEmailMessageOnUpdate =
                                orderProgramMembershipPotentialActions.sendOrder.potentialActions.sendEmailMessage;
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
                                        object: { typeOf: programMembership.typeOf, id: <string>programMembership.id },
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
                    id: programMembership.id,
                    hostingOrganization: programMembership.hostingOrganization,
                    name: programMembership.name,
                    programName: programMembership.programName,
                    project: programMembership.project,
                    award: programMembership.award
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
