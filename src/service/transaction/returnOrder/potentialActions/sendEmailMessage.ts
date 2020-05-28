import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export async function createSendEmailMessaegActionsOnReturn(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.send.message.email.IAttributes[]> {
    const transaction = params.transaction;
    const order = params.order;
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
