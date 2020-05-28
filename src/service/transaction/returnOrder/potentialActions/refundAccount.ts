import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

export async function createRefundAccountActions(params: {
    actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account>[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.PayAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = params.order;

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
                    typeOf: order.seller.typeOf,
                    id: order.seller.id,
                    name: <any>order.seller.name,
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
                project: transaction.project,
                typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                object: a,
                agent: {
                    project: transaction.project,
                    typeOf: order.seller.typeOf,
                    id: order.seller.id,
                    name: <any>order.seller.name,
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
                potentialActions: {
                    sendEmailMessage: [sendEmailMessageActionAttributes]
                }
            };
        }));
}
