import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

export async function createRefundMovieTicketActions(params: {
    // actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[]> {
    // const actionsOnOrder = params.actionsOnOrder;
    // const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
    //     .filter((a) => a.typeOf === factory.actionType.PayAction)
    //     .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    const transaction = params.transaction;
    const order = params.order;

    // ムビチケ着券返金アクション
    let refundMovieTicketActions: factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
    const refundMovieTicket = params.potentialActions?.returnOrder?.potentialActions?.refundMovieTicket === true;
    if (refundMovieTicket) {
        const movieTicketPaymentMethods = <factory.order.IPaymentMethod<factory.paymentMethodType.MovieTicket>[]>params.order.paymentMethods
            .filter((p) => p.typeOf === factory.paymentMethodType.MovieTicket);

        refundMovieTicketActions =
            // await Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.MovieTicket>[]>payActions)
            //     .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.MovieTicket)

            await Promise.all(movieTicketPaymentMethods
                .map(async (p): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>> => {
                    const emailMessage = await emailMessageBuilder.createRefundMessage({
                        order,
                        paymentMethods: [p]
                    });
                    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                        project: transaction.project,
                        typeOf: factory.actionType.SendAction,
                        object: emailMessage,
                        agent: {
                            project: transaction.project,
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
                        project: transaction.project,
                        typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                        object: p,
                        agent: {
                            project: transaction.project,
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
                        potentialActions: {
                            sendEmailMessage: [sendEmailMessageActionAttributes]
                        }
                    };
                }));
    }

    return refundMovieTicketActions;
}
