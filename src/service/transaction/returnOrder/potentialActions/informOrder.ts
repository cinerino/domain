import * as factory from '../../../../factory';

export async function createInformOrderActionsOnReturn(params: {
    order: factory.order.IOrder;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const transaction = params.transaction;
    const order = transaction.object.order;

    const informOrderActionsOnReturn: factory.action.interact.inform.IAttributes<any, any>[] = [];
    const informOrder = params.returnOrderActionParams?.potentialActions?.informOrder;
    if (Array.isArray(informOrder)) {
        informOrder.forEach((a) => {
            if (typeof a.recipient?.url === 'string') {
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
        });
    }

    // 取引に注文ステータス変更時イベントの指定があれば設定
    const informOrderByTransaction = transaction.object.onOrderStatusChanged?.informOrder;
    if (Array.isArray(informOrderByTransaction)) {
        informOrderActionsOnReturn.push(...informOrderByTransaction.map(
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

    return informOrderActionsOnReturn;
}
