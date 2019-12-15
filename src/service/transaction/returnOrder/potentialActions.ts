import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

async function createRefundCreditCardPotentialActions(params: {
    payAction: factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IPotentialActions> {
    const payAction = params.payAction;
    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    const informOrderActionsOnRefund: factory.action.interact.inform.IAttributes<any, any>[] = [];
    // Eメールカスタマイズの指定を確認
    let emailCustomization: factory.creativeWork.message.email.ICustomization | undefined;

    const refundCreditCardActionParams = (params.potentialActions !== undefined
        && params.potentialActions.returnOrder !== undefined
        && params.potentialActions.returnOrder.potentialActions !== undefined
        && params.potentialActions.returnOrder.potentialActions.refundCreditCard !== undefined)
        ? params.potentialActions.returnOrder.potentialActions.refundCreditCard
        : undefined;
    if (refundCreditCardActionParams !== undefined) {
        const assignedRefundCreditCardAction = refundCreditCardActionParams.find((refundCreditCardAction) => {
            const assignedPaymentMethod = refundCreditCardAction.object.object.find((paymentMethod) => {
                return paymentMethod.paymentMethod.paymentMethodId === payAction.object[0].paymentMethod.paymentMethodId;
            });

            return assignedPaymentMethod !== undefined;
        });

        if (assignedRefundCreditCardAction !== undefined
            && assignedRefundCreditCardAction.potentialActions !== undefined
            && assignedRefundCreditCardAction.potentialActions.sendEmailMessage !== undefined
            && assignedRefundCreditCardAction.potentialActions.sendEmailMessage.object !== undefined) {
            emailCustomization = assignedRefundCreditCardAction.potentialActions.sendEmailMessage.object;
        }

        if (assignedRefundCreditCardAction !== undefined
            && assignedRefundCreditCardAction.potentialActions !== undefined
            && Array.isArray(assignedRefundCreditCardAction.potentialActions.informOrder)) {
            assignedRefundCreditCardAction.potentialActions.informOrder.forEach((informOrderParams) => {
                if (informOrderParams.recipient !== undefined) {
                    if (typeof informOrderParams.recipient.url === 'string') {
                        informOrderActionsOnRefund.push({
                            agent: transaction.seller,
                            object: order,
                            project: transaction.project,
                            // purpose: params.transaction,
                            recipient: {
                                id: transaction.agent.id,
                                name: transaction.agent.name,
                                typeOf: transaction.agent.typeOf,
                                url: informOrderParams.recipient.url
                            },
                            typeOf: factory.actionType.InformAction
                        });
                    }
                }
            });
        }
    }

    const emailMessage = await emailMessageBuilder.createRefundMessage({
        order,
        paymentMethods: payAction.object.map((o) => o.paymentMethod),
        email: emailCustomization
    });
    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
        project: transaction.project,
        typeOf: factory.actionType.SendAction,
        object: emailMessage,
        agent: {
            project: transaction.project,
            typeOf: seller.typeOf,
            id: seller.id,
            name: seller.name,
            url: seller.url
        },
        recipient: order.customer,
        potentialActions: {},
        purpose: {
            typeOf: order.typeOf,
            seller: order.seller,
            customer: order.customer,
            confirmationNumber: order.confirmationNumber,
            orderNumber: order.orderNumber,
            price: order.price,
            priceCurrency: order.priceCurrency,
            orderDate: order.orderDate
        }
    };

    return {
        informOrder: informOrderActionsOnRefund,
        sendEmailMessage: [sendEmailMessageActionAttributes]
    };
}

async function createRefundCreditCardActions(params: {
    actionsOnOrder: IAction[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.CreditCard>[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.PayAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    // クレジットカード返金アクション
    return Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>[]>payActions)
        .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.CreditCard)
        .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.CreditCard>> => {
            const potentialActionsOnRefund = await createRefundCreditCardPotentialActions({
                payAction: a,
                potentialActions: params.potentialActions,
                seller: seller,
                transaction: transaction
            });

            return {
                project: transaction.project,
                typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                object: a,
                agent: {
                    project: transaction.project,
                    typeOf: seller.typeOf,
                    id: seller.id,
                    name: seller.name,
                    url: seller.url
                },
                recipient: order.customer,
                purpose: {
                    project: order.project,
                    typeOf: order.typeOf,
                    seller: order.seller,
                    customer: order.customer,
                    confirmationNumber: order.confirmationNumber,
                    orderNumber: order.orderNumber,
                    price: order.price,
                    priceCurrency: order.priceCurrency,
                    orderDate: order.orderDate
                },
                potentialActions: potentialActionsOnRefund
            };
        }));
}

async function createRefundAccountActions(params: {
    actionsOnOrder: IAction[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account>[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.PayAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    return Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.Account>[]>payActions)
        .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.Account)
        .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account>> => {
            const emailMessage = await emailMessageBuilder.createRefundMessage({
                order,
                paymentMethods: a.object.map((o) => o.paymentMethod)
            });
            const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                project: transaction.project,
                typeOf: factory.actionType.SendAction,
                object: emailMessage,
                agent: {
                    project: transaction.project,
                    typeOf: seller.typeOf,
                    id: seller.id,
                    name: seller.name,
                    url: seller.url
                },
                recipient: order.customer,
                potentialActions: {},
                purpose: {
                    typeOf: order.typeOf,
                    seller: order.seller,
                    customer: order.customer,
                    confirmationNumber: order.confirmationNumber,
                    orderNumber: order.orderNumber,
                    price: order.price,
                    priceCurrency: order.priceCurrency,
                    orderDate: order.orderDate
                }
            };

            return {
                project: transaction.project,
                typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                object: a,
                agent: {
                    project: transaction.project,
                    typeOf: seller.typeOf,
                    id: seller.id,
                    name: seller.name,
                    url: seller.url
                },
                recipient: order.customer,
                purpose: {
                    project: transaction.project,
                    typeOf: order.typeOf,
                    seller: order.seller,
                    customer: order.customer,
                    confirmationNumber: order.confirmationNumber,
                    orderNumber: order.orderNumber,
                    price: order.price,
                    priceCurrency: order.priceCurrency,
                    orderDate: order.orderDate
                },
                potentialActions: {
                    sendEmailMessage: [sendEmailMessageActionAttributes]
                }
            };
        }));
}

async function createRefundMovieTicketActions(params: {
    actionsOnOrder: IAction[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.PayAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    // ムビチケ着券返金アクション
    let refundMovieTicketActions: factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
    const refundMovieTicket = params.potentialActions !== undefined
        && params.potentialActions.returnOrder !== undefined
        && params.potentialActions.returnOrder.potentialActions !== undefined
        && params.potentialActions.returnOrder.potentialActions.refundMovieTicket === true;
    if (refundMovieTicket) {
        refundMovieTicketActions =
            await Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.MovieTicket>[]>payActions)
                .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.MovieTicket)
                .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>> => {
                    const emailMessage = await emailMessageBuilder.createRefundMessage({
                        order,
                        paymentMethods: a.object.map((o) => o.paymentMethod)
                    });
                    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                        project: transaction.project,
                        typeOf: factory.actionType.SendAction,
                        object: emailMessage,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
                        potentialActions: {},
                        purpose: {
                            typeOf: order.typeOf,
                            seller: order.seller,
                            customer: order.customer,
                            confirmationNumber: order.confirmationNumber,
                            orderNumber: order.orderNumber,
                            price: order.price,
                            priceCurrency: order.priceCurrency,
                            orderDate: order.orderDate
                        }
                    };

                    return {
                        project: transaction.project,
                        typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                        object: a,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
                        purpose: {
                            project: transaction.project,
                            typeOf: order.typeOf,
                            seller: order.seller,
                            customer: order.customer,
                            confirmationNumber: order.confirmationNumber,
                            orderNumber: order.orderNumber,
                            price: order.price,
                            priceCurrency: order.priceCurrency,
                            orderDate: order.orderDate
                        },
                        potentialActions: {
                            sendEmailMessage: [sendEmailMessageActionAttributes]
                        }
                    };
                }));
    }

    return refundMovieTicketActions;
}

async function createReturnPointAwardActions(params: {
    actionsOnOrder: IAction[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.returnAction.pointAward.IAttributes[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const givePointActions = <factory.action.transfer.give.pointAward.IAction[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.GiveAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.transfer.give.pointAward.ObjectType.PointAward);

    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    // ポイントインセンティブの数だけ、返却アクションを作成
    return givePointActions.map(
        (a): factory.action.transfer.returnAction.pointAward.IAttributes => {
            return {
                project: transaction.project,
                typeOf: factory.actionType.ReturnAction,
                object: a,
                agent: order.customer,
                recipient: {
                    project: transaction.project,
                    typeOf: seller.typeOf,
                    id: seller.id,
                    name: seller.name,
                    url: seller.url
                },
                potentialActions: {}
            };
        }
    );
}

// tslint:disable-next-line:max-func-body-length
async function createCancelReservationActions(params: {
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
    placeOrderTransaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.task.IData<factory.taskName.CancelReservation>[]> {
    const transaction = params.transaction;
    const order = transaction.object.order;
    const placeOrderTransaction = params.placeOrderTransaction;

    const cancelReservationActions: factory.task.IData<factory.taskName.CancelReservation>[] = [];

    let cancelReservationParams: factory.transaction.returnOrder.ICancelReservationParams[] = [];
    if (params.potentialActions !== undefined
        && params.potentialActions.returnOrder !== undefined
        && params.potentialActions.returnOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.returnOrder.potentialActions.cancelReservation)) {
        cancelReservationParams = params.potentialActions.returnOrder.potentialActions.cancelReservation;
    }

    const authorizeSeatReservationActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
        placeOrderTransaction.object.authorizeActions
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    for (const authorizeSeatReservationAction of authorizeSeatReservationActions) {
        if (authorizeSeatReservationAction.result === undefined) {
            throw new factory.errors.NotFound('Result of seat reservation authorize action');
        }

        let responseBody = authorizeSeatReservationAction.result.responseBody;

        if (authorizeSeatReservationAction.instrument === undefined) {
            authorizeSeatReservationAction.instrument = {
                typeOf: 'WebAPI',
                identifier: factory.service.webAPI.Identifier.Chevre
            };
        }

        switch (authorizeSeatReservationAction.instrument.identifier) {
            case factory.service.webAPI.Identifier.COA:
                // tslint:disable-next-line:max-line-length
                responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                if (authorizeSeatReservationAction.object.event === undefined
                    || authorizeSeatReservationAction.object.event === null) {
                    throw new factory.errors.ServiceUnavailable('Authorized event undefined');
                }
                const superEventLocationBranchCode = authorizeSeatReservationAction.object.event.superEvent.location.branchCode;

                const phoneUtil = PhoneNumberUtil.getInstance();
                const phoneNumber = phoneUtil.parse(order.customer.telephone, 'JP');
                let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
                // COAでは数字のみ受け付けるので数字以外を除去
                telNum = telNum.replace(/[^\d]/g, '');

                cancelReservationActions.push({
                    project: transaction.project,
                    typeOf: factory.actionType.CancelAction,
                    object: {
                        theaterCode: superEventLocationBranchCode,
                        reserveNum: Number(responseBody.tmpReserveNum),
                        telNum: telNum
                    },
                    agent: transaction.agent,
                    potentialActions: {
                    },
                    purpose: {
                        typeOf: order.typeOf,
                        seller: order.seller,
                        customer: order.customer,
                        confirmationNumber: order.confirmationNumber,
                        orderNumber: order.orderNumber,
                        price: order.price,
                        priceCurrency: order.priceCurrency,
                        orderDate: order.orderDate
                    },
                    instrument: authorizeSeatReservationAction.instrument
                });

                break;

            default:
                // tslint:disable-next-line:max-line-length
                const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                const cancelReservationAction: factory.task.IData<factory.taskName.CancelReservation> = {
                    project: transaction.project,
                    typeOf: factory.actionType.CancelAction,
                    object: reserveTransaction,
                    agent: transaction.agent,
                    potentialActions: {},
                    purpose: {
                        typeOf: order.typeOf,
                        seller: order.seller,
                        customer: order.customer,
                        confirmationNumber: order.confirmationNumber,
                        orderNumber: order.orderNumber,
                        price: order.price,
                        priceCurrency: order.priceCurrency,
                        orderDate: order.orderDate
                    },
                    instrument: authorizeSeatReservationAction.instrument
                };

                const cancelReservationObjectParams = cancelReservationParams.find((p) => {
                    // tslint:disable-next-line:max-line-length
                    const object = <factory.transaction.returnOrder.ICancelReservationObject<factory.service.webAPI.Identifier.Chevre>>
                        p.object;

                    return object === undefined
                        || (object !== undefined
                            && object.typeOf === factory.chevre.transactionType.Reserve
                            && object.id === reserveTransaction.id);
                });

                if (cancelReservationObjectParams !== undefined) {
                    // 予約取消確定後アクションの指定があれば上書き
                    if (cancelReservationObjectParams.potentialActions !== undefined
                        && cancelReservationObjectParams.potentialActions.cancelReservation !== undefined
                        && cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions !== undefined
                        && Array.isArray(
                            cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions.informReservation
                        )) {
                        cancelReservationAction.potentialActions = {
                            cancelReservation: {
                                potentialActions: {
                                    // tslint:disable-next-line:max-line-length
                                    informReservation: cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions.informReservation
                                }
                            }
                        };
                    }
                }

                cancelReservationActions.push(cancelReservationAction);
        }
    }

    return cancelReservationActions;
}

async function createInformOrderActionsOnReturn(params: {
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const transaction = params.transaction;
    const order = transaction.object.order;

    const informOrderActionsOnReturn: factory.action.interact.inform.IAttributes<any, any>[] = [];
    if (params.potentialActions !== undefined) {
        if (params.potentialActions.returnOrder !== undefined) {
            if (params.potentialActions.returnOrder.potentialActions !== undefined) {
                if (Array.isArray(params.potentialActions.returnOrder.potentialActions.informOrder)) {
                    params.potentialActions.returnOrder.potentialActions.informOrder.forEach((a) => {
                        if (a.recipient !== undefined) {
                            if (typeof a.recipient.url === 'string') {
                                informOrderActionsOnReturn.push({
                                    agent: transaction.seller,
                                    object: order,
                                    project: transaction.project,
                                    // purpose: params.transaction,
                                    recipient: {
                                        id: transaction.agent.id,
                                        name: transaction.agent.name,
                                        typeOf: transaction.agent.typeOf,
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
    if (transaction.object !== undefined && transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(transaction.object.onOrderStatusChanged.informOrder)) {
            informOrderActionsOnReturn.push(...transaction.object.onOrderStatusChanged.informOrder.map(
                (a): factory.action.interact.inform.IAttributes<any, any> => {
                    return {
                        agent: transaction.seller,
                        object: order,
                        project: transaction.project,
                        // purpose: params.transaction,
                        recipient: {
                            id: transaction.agent.id,
                            name: transaction.agent.name,
                            typeOf: transaction.agent.typeOf,
                            ...a.recipient
                        },
                        typeOf: factory.actionType.InformAction
                    };
                })
            );
        }
    }

    return informOrderActionsOnReturn;
}

async function createSendEmailMessaegActionsOnReturn(params: {
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.send.message.email.IAttributes[]> {
    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    // 返品後のEメール送信アクション
    const sendEmailMessaegActionsOnReturn: factory.action.transfer.send.message.email.IAttributes[] = [];
    if (params.potentialActions !== undefined
        && params.potentialActions.returnOrder !== undefined
        && params.potentialActions.returnOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.returnOrder.potentialActions.sendEmailMessage)) {
        sendEmailMessaegActionsOnReturn.push(
            ...await Promise.all(params.potentialActions.returnOrder.potentialActions.sendEmailMessage.map(
                async (sendEmailMessageParams): Promise<factory.action.transfer.send.message.email.IAttributes> => {
                    const emailMessage = await emailMessageBuilder.createReturnOrderMessage({
                        order,
                        email: sendEmailMessageParams.object
                    });

                    return {
                        project: params.transaction.project,
                        typeOf: factory.actionType.SendAction,
                        object: emailMessage,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
                        potentialActions: {},
                        purpose: {
                            typeOf: order.typeOf,
                            seller: order.seller,
                            customer: order.customer,
                            confirmationNumber: order.confirmationNumber,
                            orderNumber: order.orderNumber,
                            price: order.price,
                            priceCurrency: order.priceCurrency,
                            orderDate: order.orderDate
                        }
                    };
                }
            ))
        );
    }

    return sendEmailMessaegActionsOnReturn;
}

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    actionsOnOrder: IAction[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
    placeOrderTransaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.transaction.returnOrder.IPotentialActions> {
    const transaction = params.transaction;
    const order = transaction.object.order;
    const seller = params.seller;

    // クレジットカード返金アクション
    const refundCreditCardActions = await createRefundCreditCardActions(params);

    // 口座返金アクション
    const refundAccountActions = await createRefundAccountActions(params);

    // ムビチケ着券返金アクション
    const refundMovieTicketActions = await createRefundMovieTicketActions(params);

    // ポイントインセンティブの数だけ、返却アクションを作成
    const returnPointAwardActions = await createReturnPointAwardActions(params);

    const cancelReservationActions = await createCancelReservationActions(params);

    const informOrderActionsOnReturn = await createInformOrderActionsOnReturn(params);

    // 返品後のEメール送信アクション
    const sendEmailMessaegActionsOnReturn = await createSendEmailMessaegActionsOnReturn(params);

    const returnOrderActionAttributes: factory.action.transfer.returnAction.order.IAttributes = {
        project: order.project,
        typeOf: factory.actionType.ReturnAction,
        object: {
            project: order.project,
            typeOf: order.typeOf,
            seller: order.seller,
            customer: order.customer,
            confirmationNumber: order.confirmationNumber,
            orderNumber: order.orderNumber,
            price: order.price,
            priceCurrency: order.priceCurrency,
            orderDate: order.orderDate
        },
        agent: transaction.agent,
        recipient: seller,
        potentialActions: {
            cancelReservation: cancelReservationActions,
            informOrder: informOrderActionsOnReturn,
            refundCreditCard: refundCreditCardActions,
            refundAccount: refundAccountActions,
            refundMovieTicket: refundMovieTicketActions,
            returnPointAward: returnPointAwardActions,
            sendEmailMessage: sendEmailMessaegActionsOnReturn
        }
    };

    return {
        returnOrder: returnOrderActionAttributes
    };
}
