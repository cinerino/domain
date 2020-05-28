import * as factory from '../../../../factory';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export async function createReturnPointAwardActions(params: {
    actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.transfer.returnAction.pointAward.IAttributes[]> {
    const actionsOnOrder = params.actionsOnOrder;
    const givePointActions = <factory.action.transfer.give.pointAward.IAction[]>actionsOnOrder
        .filter((a) => a.typeOf === factory.actionType.GiveAction)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.transfer.give.pointAward.ObjectType.PointAward);

    const transaction = params.transaction;
    const order = params.order;
    const seller = params.seller;

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
                    typeOf: seller.typeOf,
                    id: seller.id,
                    name: seller.name,
                    url: seller.url
                },
                potentialActions: {}
            };
        }
    );
}
