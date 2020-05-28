import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

export async function createReturnPointAwardActions(params: {
    actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.returnAction.pointAward.IAttributes[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const givePointActions = <factory.action.transfer.give.pointAward.IAction[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.GiveAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.transfer.give.pointAward.ObjectType.PointAward);

    const transaction = params.transaction;
    const order = params.order;

    // ポイントインセンティブの数だけ、返却アクションを作成
    return givePointActions.map(
        (a): factory.action.transfer.returnAction.pointAward.IAttributes => {
            return {
                project: transaction.project,
                typeOf: factory.actionType.ReturnAction,
                object: a,
                agent: order.customer,
                recipient: {
                    project: transaction.project,
                    typeOf: order.seller.typeOf,
                    id: order.seller.id,
                    name: <any>order.seller.name,
                    url: order.seller.url
                },
                potentialActions: {}
            };
        }
    );
}
