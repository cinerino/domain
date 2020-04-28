import * as factory from '../../../../factory';

export async function createGivePointAwardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.give.pointAward.IAttributes[]> {
    let actions: factory.action.transfer.give.pointAward.IAttributes[] = [];

    // 取引agentに所有メンバーシップがあれば、そちらを元にインセンティブ付与アクションを作成
    const givePointAwardParams = params.potentialActions?.order?.potentialActions?.givePointAward;
    if (Array.isArray(givePointAwardParams)) {
        if (params.order.price > 0) {
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
    } else {
        // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
        const pointAwardAuthorizeActions =
            (<factory.action.authorize.award.point.IAction[]>params.transaction.object.authorizeActions)
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);

        actions = pointAwardAuthorizeActions.map((a) => {
            const actionResult = <factory.action.authorize.award.point.IResult>a.result;

            return {
                project: params.transaction.project,
                typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
                agent: params.transaction.seller,
                recipient: params.transaction.agent,
                object: {
                    typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                    pointTransaction: actionResult.pointTransaction,
                    amount: a.object.amount,
                    toLocation: {
                        accountType: factory.accountType.Point,
                        accountNumber: a.object.toAccountNumber
                    },
                    description: (typeof a.object.notes === 'string') ? a.object.notes : ''
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
            };
        });
    }

    return actions;
}
