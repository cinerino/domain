import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

export async function createRefundMovieTicketActions(params: {
    order: factory.order.IOrder;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.trade.refund.IAttributes[]> {
    const transaction = params.transaction;
    const order = params.order;

    // ムビチケ着券返金アクション
    let refundMovieTicketActions: factory.action.trade.refund.IAttributes[] = [];
    const refundMovieTicket = params.returnOrderActionParams?.potentialActions?.refundMovieTicket === true;
    if (refundMovieTicket) {
        // tslint:disable-next-line:no-suspicious-comment
        // TODO 利用可能なムビチケ系統決済方法タイプに対して動的にコーディング
        const movieTicketPaymentMethods = <factory.order.IPaymentMethod<factory.paymentMethodType.MovieTicket>[]>
            params.order.paymentMethods.filter((p) => p.typeOf === factory.paymentMethodType.MovieTicket
                || p.typeOf === factory.paymentMethodType.MGTicket);

        refundMovieTicketActions =
            await Promise.all(movieTicketPaymentMethods
                .map(async (p): Promise<factory.action.trade.refund.IAttributes> => {
                    const emailMessage = await emailMessageBuilder.createRefundMessage({
                        order,
                        paymentMethods: [p]
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
