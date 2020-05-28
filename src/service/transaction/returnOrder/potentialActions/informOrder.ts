import * as factory from '../../../../factory';

export async function createInformOrderActionsOnReturn(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const transaction = params.transaction;
    const order = transaction.object.order;

    const informOrderActionsOnReturn: factory.action.interact.inform.IAttributes<any, any>[] = [];
    if (params.potentialActions !== undefined) {
        if (params.potentialActions.returnOrder !== undefined) {
            if (params.potentialActions.returnOrder.potentialActions !== undefined) {
                if (Array.isArray(params.potentialActions.returnOrder.potentialActions.informOrder)) {
                    params.potentialActions.returnOrder.potentialActions.informOrder.forEach((a) => {
                        if (a.recipient !== undefined) {
                            if (typeof a.recipient.url === 'string') {
                                informOrderActionsOnReturn.push({
                                    agent: transaction.seller,
                                    object: order,
                                    project: transaction.project,
                                    // purpose: params.transaction,
                                    recipient: {
                                        id: transaction.agent.id,
                                        name: transaction.agent.name,
                                        typeOf: transaction.agent.typeOf,
                                        url: a.recipient.url
                                    },
                                    typeOf: factory.actionType.InformAction
                                });
                            }
                        }
                    });
                }
            }
        }
    }

    // 取引に注文ステータス変更時イベントの指定があれば設定
    if (transaction.object !== undefined && transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(transaction.object.onOrderStatusChanged.informOrder)) {
            informOrderActionsOnReturn.push(...transaction.object.onOrderStatusChanged.informOrder.map(
                (a): factory.action.interact.inform.IAttributes<any, any> => {
                    return {
                        agent: transaction.seller,
                        object: order,
                        project: transaction.project,
                        // purpose: params.transaction,
                        recipient: {
                            id: transaction.agent.id,
                            name: transaction.agent.name,
                            typeOf: transaction.agent.typeOf,
                            ...a.recipient
                        },
                        typeOf: factory.actionType.InformAction
                    };
                })
            );
        }
    }

    return informOrderActionsOnReturn;
}
