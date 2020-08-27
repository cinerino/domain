import * as factory from '../../../../factory';

export async function createPayActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes[]> {
    const authorizePaymentActions = (<factory.action.authorize.paymentMethod.any.IAction[]>
        params.transaction.object.authorizeActions)
        .filter(
            (a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
                && a.object.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment
                && a.result?.paymentStatus === factory.paymentStatusType.PaymentDue
        );

    return authorizePaymentActions.map((a) => {
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
                    typeOf: result.paymentMethod
                },
                ...(result.pendingTransaction !== undefined) ? { pendingTransaction: result.pendingTransaction } : undefined,
                ...(Array.isArray(a.object.movieTickets)) ? { movieTickets: a.object.movieTickets } : undefined
            }],
            agent: params.transaction.agent,
            recipient: params.transaction.seller,
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
