import * as factory from '../../../../factory';

export async function createPayAccountActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes[]> {
    // 口座決済アクション
    const authorizeAccountActions =
        (<factory.action.authorize.paymentMethod.any.IAction[]>params.transaction.object.authorizeActions)
            .filter(
                (a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
                    && a.result?.paymentMethod === factory.paymentMethodType.Account
            );

    return authorizeAccountActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.any.IResult>a.result;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: [{
                typeOf: factory.action.trade.pay.ObjectType.PaymentMethod,
                paymentMethod: {
                    accountId: result.accountId,
                    additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                    name: result.name,
                    paymentMethodId: result.paymentMethodId,
                    totalPaymentDue: result.totalPaymentDue,
                    typeOf: <factory.paymentMethodType.Account>result.paymentMethod
                },
                pendingTransaction:
                    (<factory.action.authorize.paymentMethod.any.IResult>a.result).pendingTransaction
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
            },
            ...(typeof a.instrument?.typeOf === 'string') ? { instrument: a.instrument } : undefined
        };
    });
}
