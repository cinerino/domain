import * as factory from '../../../../factory';

export async function createRegisterServiceActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[]> {
    const registerServiceActions: factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[] = [];

    const authorizePaymentCardOfferActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) =>
            Array.isArray(a.object)
            && a.object.length > 0
            && a.object[0].typeOf === factory.chevre.offerType.Offer
            && a.object[0].itemOffered.typeOf === factory.paymentMethodType.PaymentCard
        );

    authorizePaymentCardOfferActions.forEach((a) => {
        const actionResult = a.result;

        if (actionResult !== undefined) {
            // const requestBody = actionResult.requestBody;
            const responseBody = actionResult.responseBody;

            // tslint:disable-next-line:max-line-length
            const registerServiceTransaction = responseBody;

            const registerServiceObject = createRegisterServiceActionObject({
                order: params.order,
                potentialActions: params.potentialActions,
                transaction: params.transaction,
                registerServiceTransaction: registerServiceTransaction
            });

            registerServiceActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.RegisterAction>factory.actionType.RegisterAction,
                object: registerServiceObject,
                agent: params.transaction.agent,
                purpose: <any>{
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
            });
        }
    });

    return registerServiceActions;
}

// tslint:disable-next-line:max-func-body-length
function createRegisterServiceActionObject(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
    registerServiceTransaction: any;
}): factory.chevre.transaction.registerService.IConfirmParams {
    return <any>{
        typeOf: factory.chevre.transactionType.RegisterService,
        id: params.registerServiceTransaction.id,
        object: {
        }
    };
}
