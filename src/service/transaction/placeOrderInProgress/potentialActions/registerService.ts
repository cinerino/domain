import * as factory from '../../../../factory';

import { availableProductTypes } from '../../../offer/product/factory';

export async function createRegisterServiceActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[]> {
    const registerServiceActions: factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[] = [];

    const authorizeProductOfferActions = (<factory.action.authorize.offer.paymentCard.IAction[]>
        params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) =>
            Array.isArray(a.object)
            && a.object.length > 0
            && a.object[0].typeOf === factory.chevre.offerType.Offer
            && availableProductTypes.indexOf(a.object[0].itemOffered.typeOf) >= 0
        );

    authorizeProductOfferActions.forEach((a) => {
        const actionResult = a.result;

        if (actionResult !== undefined) {
            // const requestBody = actionResult.requestBody;
            // const registerServiceTransaction = (<any>actionResult).responseBody;

            const registerServiceObject = createRegisterServiceActionObject({
                order: params.order,
                potentialActions: params.potentialActions,
                transaction: params.transaction,
                // registerServiceTransaction: registerServiceTransaction,
                transactionNumber: a.instrument?.transactionNumber
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

function createRegisterServiceActionObject(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
    // registerServiceTransaction: any;
    transactionNumber?: string;
}): factory.chevre.transaction.registerService.IConfirmParams {
    return {
        // id: params.registerServiceTransaction.id,
        transactionNumber: params.transactionNumber,
        // endDate?: Date;
        object: {
        }
        // potentialActions?: IPotentialActionsParams;
    };
}
