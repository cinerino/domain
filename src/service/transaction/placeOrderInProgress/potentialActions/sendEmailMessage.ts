import * as emailMessageBuilder from '../../../../emailMessageBuilder';

import * as factory from '../../../../factory';

export async function createSendEmailMessageActions(params: {
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
