import * as factory from '../../../../factory';

export async function createInformOrderOnPlacedActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    token?: string;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnPlaceOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    // 取引に注文ステータス変更時イベントの指定があれば設定
    const onOrderStatusChangedParams = params.transaction.object?.onOrderStatusChanged?.informOrder;
    if (Array.isArray(onOrderStatusChangedParams)) {
        const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[] = onOrderStatusChangedParams.map(
            (a) => {
                return {
                    agent: params.transaction.seller,
                    object: {
                        ...params.order,
                        // 注文トークンを情報付加
                        ...(typeof params.token === 'string') ? { token: params.token } : undefined
                    },
                    project: params.transaction.project,
                    // purpose: params.transaction,
                    recipient: {
                        ...a.recipient,
                        project: params.transaction.project,
                        id: (typeof a.recipient?.id === 'string') ? a.recipient.id : params.transaction.agent.id,
                        name: (typeof a.recipient?.name === 'string') ? a.recipient.name : params.transaction.agent.name,
                        typeOf: (typeof a.recipient?.typeOf === 'string') ? <any>a.recipient.typeOf : params.transaction.agent.typeOf
                    },
                    typeOf: factory.actionType.InformAction
                };
            }
        );

        informOrderActionsOnPlaceOrder.push(...informOrderActionAttributes);
    }

    return informOrderActionsOnPlaceOrder;
}

export async function createInformOrderOnSentActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnSentOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    // 取引に注文ステータス変更時イベントの指定があれば設定
    const onOrderStatusChangedParams = params.transaction.object?.onOrderStatusChanged?.informOrder;
    if (Array.isArray(onOrderStatusChangedParams)) {
        const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[] = onOrderStatusChangedParams.map(
            (a) => {
                return {
                    agent: params.transaction.seller,
                    object: params.order,
                    project: params.transaction.project,
                    // purpose: params.transaction,
                    recipient: {
                        ...a.recipient,
                        project: params.transaction.project,
                        id: (typeof a.recipient?.id === 'string') ? a.recipient.id : params.transaction.agent.id,
                        name: (typeof a.recipient?.name === 'string') ? a.recipient.name : params.transaction.agent.name,
                        typeOf: (typeof a.recipient?.typeOf === 'string') ? <any>a.recipient.typeOf : params.transaction.agent.typeOf
                    },
                    typeOf: factory.actionType.InformAction
                };
            }
        );

        informOrderActionsOnSentOrder.push(...informOrderActionAttributes);
    }

    return informOrderActionsOnSentOrder;
}
