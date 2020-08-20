import * as factory from '../../../../factory';

export async function createPayPaymentCardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<any>[]> {
    // 口座決済アクション
    const authorizePaymentCardActions =
        (<factory.action.authorize.paymentMethod.paymentCard.IAction[]>params.transaction.object.authorizeActions)
            .filter(
                (a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
                    // tslint:disable-next-line:no-suspicious-comment
                    // TODO Chevre決済カードサービスに対して動的にコントロール
                    && a.result?.paymentMethod === factory.paymentMethodType.PaymentCard
            );

    return authorizePaymentCardActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.paymentCard.IResult>a.result;

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
                    typeOf: result.paymentMethod
                },
                pendingTransaction:
                    (<factory.action.authorize.paymentMethod.paymentCard.IResult>a.result).pendingTransaction
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
