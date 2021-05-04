import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

async function createRefundPotentialActions(params: {
    order: factory.order.IOrder;
    paymentMethod: factory.order.IPaymentMethod;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.returnAction.paymentMethod.IPotentialActions> {
    const transaction = params.transaction;
    const order = params.order;

    const informOrderActionsOnRefund: factory.action.interact.inform.IAttributes<any, any>[] = [];
    const sendEmailMessageOnRefund: factory.action.transfer.send.message.email.IAttributes[] = [];

    // Eメールカスタマイズの指定を確認
    let emailCustomization: factory.creativeWork.message.email.ICustomization | undefined;

    if (params.paymentMethod.typeOf === factory.paymentMethodType.CreditCard) {
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
        }
    }

    if (emailCustomization !== undefined && emailCustomization !== null) {
        const emailMessage = await emailMessageBuilder.createRefundMessage({
            order,
            paymentMethods: [params.paymentMethod],
            email: emailCustomization
        });
        sendEmailMessageOnRefund.push({
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
        });
    }

    return {
        informOrder: informOrderActionsOnRefund,
        sendEmailMessage: sendEmailMessageOnRefund
    };
}

export async function createRefundActions(params: {
    order: factory.order.IOrder;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.returnAction.paymentMethod.IAttributes[]> {
    const transaction = params.transaction;
    const order = params.order;

    const nonrefundingPaymentMethodTypes: string[] = [];
    const refundMovieTicket = params.returnOrderActionParams?.potentialActions?.refundMovieTicket === true;
    if (!refundMovieTicket) {
        nonrefundingPaymentMethodTypes.push(factory.paymentMethodType.MovieTicket);
    }

    const refundingPaymentMethods = params.order.paymentMethods.filter(
        (p) => typeof p.paymentMethodId === 'string' && p.paymentMethodId.length > 0
            && !nonrefundingPaymentMethodTypes.includes(p.typeOf) // 返金対象外に含まれない決済方法のみ
    );

    return Promise.all(refundingPaymentMethods.map(async (p): Promise<factory.action.transfer.returnAction.paymentMethod.IAttributes> => {
        const potentialActionsOnRefund = await createRefundPotentialActions({
            paymentMethod: p,
            order: params.order,
            returnOrderActionParams: params.returnOrderActionParams,
            transaction: transaction
        });

        return {
            project: transaction.project,
            typeOf: factory.actionType.ReturnAction,
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
            potentialActions: potentialActionsOnRefund
        };
    }));
}
