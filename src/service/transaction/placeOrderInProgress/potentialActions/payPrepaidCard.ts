import * as factory from '../../../../factory';

export async function createPayPrepaidCardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<factory.paymentMethodType.PrepaidCard>[]> {
    // 口座決済アクション
    const authorizePrepaidCardActions = <factory.action.authorize.paymentMethod.prepaidCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.PrepaidCard);

    return authorizePrepaidCardActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.prepaidCard.IResult>a.result;

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
                    typeOf: <factory.paymentMethodType.PrepaidCard>result.paymentMethod
                },
                pendingTransaction:
                    (<factory.action.authorize.paymentMethod.prepaidCard.IResult>a.result).pendingTransaction
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
