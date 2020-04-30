import { createConfirmReservationActions } from './potentialActions/confirmReservation';
import { createGivePointAwardActions } from './potentialActions/givePointAward';
import { createMoneyTransferActions } from './potentialActions/moneyTransfer';
import { createRegisterProgramMembershipActions } from './potentialActions/registerProgramMembership';

import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

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
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<string>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);

    return authorizeAccountActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.account.IResult<string>>a.result;

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
                    (<factory.action.authorize.paymentMethod.account.IResult<string>>a.result).pendingTransaction
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
