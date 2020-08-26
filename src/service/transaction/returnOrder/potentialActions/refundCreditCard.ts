import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

async function createRefundCreditCardPotentialActions(params: {
    order: factory.order.IOrder;
    paymentMethod: factory.order.IPaymentMethod<factory.paymentMethodType.CreditCard>;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IPotentialActions> {
    const transaction = params.transaction;
    const order = params.order;

    const informOrderActionsOnRefund: factory.action.interact.inform.IAttributes<any, any>[] = [];
    // Eメールカスタマイズの指定を確認
    let emailCustomization: factory.creativeWork.message.email.ICustomization | undefined;

    const refundCreditCardActionParams = params.returnOrderActionParams?.potentialActions?.refundCreditCard;
    if (refundCreditCardActionParams !== undefined) {
        const assignedRefundCreditCardAction = refundCreditCardActionParams.find((refundCreditCardAction) => {
            const assignedPaymentMethod = refundCreditCardAction.object.object.find((paymentMethod) => {
                return paymentMethod.paymentMethod.paymentMethodId === params.paymentMethod.paymentMethodId;
            });

            return assignedPaymentMethod !== undefined;
        });

        if (assignedRefundCreditCardAction?.potentialActions?.sendEmailMessage?.object !== undefined) {
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
        paymentMethods: [params.paymentMethod],
        email: emailCustomization
    });
    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
        project: transaction.project,
        typeOf: factory.actionType.SendAction,
        object: emailMessage,
        agent: {
            project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
            typeOf: order.seller.typeOf,
            id: order.seller.id,
            name: order.seller.name,
            url: order.seller.url
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

export async function createRefundCreditCardActions(params: {
    order: factory.order.IOrder;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes[]> {
    const transaction = params.transaction;
    const order = params.order;

    // クレジットカード返金アクション作成
    const creditCardPaymentMethods = <factory.order.IPaymentMethod<factory.paymentMethodType.CreditCard>[]>params.order.paymentMethods
        .filter((p) => p.typeOf === factory.paymentMethodType.CreditCard)
        // 決済連携していないクレジットカード決済を除外する
        .filter((p) => typeof p.paymentMethodId === 'string' && p.paymentMethodId.length > 0);

    return Promise.all(creditCardPaymentMethods
        .map(async (p): Promise<factory.action.trade.refund.IAttributes> => {
            const potentialActionsOnRefund = await createRefundCreditCardPotentialActions({
                paymentMethod: p,
                order: params.order,
                returnOrderActionParams: params.returnOrderActionParams,
                transaction: transaction
            });

            return {
                project: transaction.project,
                typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                object: p,
                agent: {
                    project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                    typeOf: order.seller.typeOf,
                    id: order.seller.id,
                    name: order.seller.name,
                    url: order.seller.url
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
