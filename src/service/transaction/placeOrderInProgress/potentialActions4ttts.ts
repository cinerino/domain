import * as factory from '../../../factory';

export type IAuthorizeSeatReservationOffer =
    factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;

/**
 * 取引のポストアクションを作成する
 */
// tslint:disable-next-line:max-func-body-length
export async function createPotentialActions(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    // クレジットカード支払いアクション
    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

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

    const confirmReservationActions:
        factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[] = [];
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
            const responseBody = actionResult.responseBody;

            switch (a.instrument.identifier) {
                default:
                    // tslint:disable-next-line:max-line-length
                    // responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    // tslint:disable-next-line:max-line-length
                    const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    const chevreReservations = (Array.isArray(reserveTransaction.object.reservations))
                        ? reserveTransaction.object.reservations
                        : [];
                    const defaultUnderNameIdentifiers: factory.propertyValue.IPropertyValue<string>[]
                        = [{ name: 'orderNumber', value: params.order.orderNumber }];

                    const confirmReservationObject:
                        factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> = {
                        typeOf: factory.chevre.transactionType.Reserve,
                        id: reserveTransaction.id,
                        object: {
                            reservations: [
                                ...params.order.acceptedOffers.map((o) => <factory.order.IReservation>o.itemOffered)
                                    .map((r) => {
                                        // プロジェクト固有の値を連携
                                        return {
                                            id: r.id,
                                            additionalTicketText: r.additionalTicketText,
                                            // reservedTicket: {
                                            //     issuedBy: r.reservedTicket.issuedBy,
                                            //     ticketToken: r.reservedTicket.ticketToken,
                                            //     underName: r.reservedTicket.underName
                                            // },
                                            underName: r.underName,
                                            additionalProperty: r.additionalProperty
                                        };
                                    }),
                                // 余分確保分の予約にもextraプロパティを連携
                                ...chevreReservations.filter((r) => {
                                    // 注文アイテムに存在しない予約(余分確保分)にフィルタリング
                                    const orderItem = params.order.acceptedOffers.find(
                                        (o) => (<factory.order.IReservation>o.itemOffered).id === r.id
                                    );

                                    return orderItem === undefined;
                                })
                                    .map((r) => {
                                        return {
                                            id: r.id,
                                            additionalProperty: [
                                                { name: 'extra', value: '1' }
                                            ]
                                        };
                                    })
                            ]
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

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        project: params.transaction.project,
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            confirmReservation: confirmReservationActions
            // sendEmailMessage: (sendEmailMessageActionAttributes !== null) ? sendEmailMessageActionAttributes : undefined,
        }
    };

    return {
        order: {
            project: params.transaction.project,
            typeOf: factory.actionType.OrderAction,
            object: params.order,
            agent: params.transaction.agent,
            potentialActions: {
                informOrder: informOrderActionsOnPlaceOrder,
                payCreditCard: payCreditCardActions,
                sendOrder: sendOrderActionAttributes
            },
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        }
    };
}
