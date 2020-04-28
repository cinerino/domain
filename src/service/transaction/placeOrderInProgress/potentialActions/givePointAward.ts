import * as factory from '../../../../factory';

export async function createGivePointAwardActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.transfer.give.pointAward.IAttributes[]> {
    let actinos: factory.action.transfer.give.pointAward.IAttributes[] = [];

    // 取引agentに所有メンバーシップがあれば、そちらを元にインセンティブ付与アクションを作成
    // const programMemberhips = <factory.programMembership.IProgramMembership[]>(<any>params.transaction.agent).memberOfs;
    // if (Array.isArray(programMemberhips) && programMemberhips.length > 0) {
    //     if (params.order.price > 0) {
    //         // メンバーシップごとに、会員プログラムの特典を確認してインセンティブ付与
    //     }
    // } else {
    // }

    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
    const pointAwardAuthorizeActions =
        (<factory.action.authorize.award.point.IAction[]>params.transaction.object.authorizeActions)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);

    actinos = pointAwardAuthorizeActions.map((a) => {
        const actionResult = <factory.action.authorize.award.point.IResult>a.result;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            object: {
                typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                pointTransaction: actionResult.pointTransaction,
                pointAPIEndpoint: actionResult.pointAPIEndpoint,
                ...{
                    amount: a.object.amount,
                    toLocation: {
                        accountType: factory.accountType.Point,
                        accountNumber: a.object.toAccountNumber
                    },
                    notes: a.object.notes
                }
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

    return actinos;
}
