import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export async function createRefundMovieTicketActions(params: {
    actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.PayAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = params.order;
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
