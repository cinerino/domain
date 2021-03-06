import * as factory from '../../../../factory';

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.monetaryAmount.IAction;

export async function createMoneyTransferActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.moneyTransfer.IAttributes[]> {
    const moneyTransferActions: factory.action.transfer.moneyTransfer.IAttributes[] = [];

    const authorizeMoneyTransferActions = (<IAuthorizeMoneyTransferOffer[]>params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');

    const paymentMethod = params.order.paymentMethods[0];
    authorizeMoneyTransferActions.forEach((a) => {
        const actionResult = a.result;
        const pendingTransaction = a.object.pendingTransaction;

        if (actionResult !== undefined && pendingTransaction !== undefined) {
            moneyTransferActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.MoneyTransfer>factory.actionType.MoneyTransfer,
                object: {
                    pendingTransaction: actionResult.responseBody
                },
                agent: params.transaction.agent,
                recipient: a.recipient,
                amount: pendingTransaction.object.amount,
                fromLocation: (paymentMethod !== undefined)
                    ? {
                        accountId: paymentMethod.accountId,
                        typeOf: paymentMethod.typeOf,
                        name: paymentMethod.name,
                        paymentMethodId: paymentMethod.paymentMethodId,
                        additionalProperty: paymentMethod.additionalProperty
                    }
                    : {
                        typeOf: params.transaction.agent.typeOf,
                        id: params.transaction.agent.id,
                        name: <string>params.transaction.agent.name
                    },
                toLocation: pendingTransaction.object.toLocation,
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
                },
                ...(typeof actionResult.responseBody.object.description === 'string')
                    ? { description: actionResult.responseBody.object.description }
                    : {}
            });
        }
    });

    return moneyTransferActions;
}
