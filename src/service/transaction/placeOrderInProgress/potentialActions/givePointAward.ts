import * as factory from '../../../../factory';

export async function createGivePointAwardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.give.pointAward.IAttributes[]> {
    const actions: factory.action.transfer.give.pointAward.IAttributes[] = [];

    // インセンティブ付与アクションの指定があればそちらを反映
    // const givePointAwardParams = params.potentialActions?.order?.potentialActions?.givePointAward;
    const givePointAwardParams = (<any>params.transaction.object).potentialActions?.givePointAward;
    if (Array.isArray(givePointAwardParams)) {
        // メンバーシップごとに、会員プログラムの特典を確認してインセンティブ付与
        givePointAwardParams.forEach((givePointAwardParam) => {
            const amount = givePointAwardParam.object?.amount;
            const accountNumber = givePointAwardParam.object?.toLocation?.accountNumber;
            const accountType = givePointAwardParam.object?.toLocation?.accountType;
            const description = givePointAwardParam.object?.description;

            if (typeof amount === 'number'
                && typeof accountNumber === 'string'
                && typeof accountType === 'string') {
                actions.push({
                    project: params.transaction.project,
                    typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
                    agent: params.transaction.seller,
                    recipient: params.transaction.agent,
                    object: {
                        typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                        amount: amount,
                        toLocation: {
                            accountNumber: accountNumber,
                            accountType: accountType
                        },
                        description: (typeof description === 'string') ? description : ''
                    },
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
                });
            }
        });
    }

    return actions;
}
