import * as factory from '../../../../factory';

export async function createInformOrderOnPlacedActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnPlaceOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (Array.isArray(params.potentialActions.order.potentialActions.informOrder)) {
                    params.potentialActions.order.potentialActions.informOrder.forEach((a) => {
                        if (a.recipient !== undefined) {
                            if (typeof a.recipient.url === 'string') {
                                informOrderActionsOnPlaceOrder.push({
                                    agent: params.transaction.seller,
                                    object: params.order,
                                    project: params.transaction.project,
                                    // purpose: params.transaction,
                                    recipient: {
                                        id: params.transaction.agent.id,
                                        name: params.transaction.agent.name,
                                        typeOf: params.transaction.agent.typeOf,
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
    if (params.transaction.object !== undefined && params.transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(params.transaction.object.onOrderStatusChanged.informOrder)) {
            const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[]
                = params.transaction.object.onOrderStatusChanged.informOrder.map(
                    (a) => {
                        return {
                            agent: params.transaction.seller,
                            object: params.order,
                            project: params.transaction.project,
                            // purpose: params.transaction,
                            recipient: {
                                id: params.transaction.agent.id,
                                name: params.transaction.agent.name,
                                typeOf: params.transaction.agent.typeOf,
                                ...a.recipient
                            },
                            typeOf: factory.actionType.InformAction
                        };
                    }
                );

            informOrderActionsOnPlaceOrder.push(...informOrderActionAttributes);
        }
    }

    return informOrderActionsOnPlaceOrder;
}

export async function createInformOrderOnSentActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.inform.IAttributes<any, any>[]> {
    const informOrderActionsOnSentOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];

    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (params.potentialActions.order.potentialActions.sendOrder !== undefined) {
                    if (params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined) {
                        if (Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder)) {
                            params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder.forEach((a) => {
                                if (a.recipient !== undefined) {
                                    if (typeof a.recipient.url === 'string') {
                                        informOrderActionsOnSentOrder.push({
                                            agent: params.transaction.seller,
                                            object: params.order,
                                            project: params.transaction.project,
                                            // purpose: params.transaction,
                                            recipient: {
                                                id: params.transaction.agent.id,
                                                name: params.transaction.agent.name,
                                                typeOf: params.transaction.agent.typeOf,
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
        }
    }

    // 取引に注文ステータス変更時イベントの指定があれば設定
    if (params.transaction.object !== undefined && params.transaction.object.onOrderStatusChanged !== undefined) {
        if (Array.isArray(params.transaction.object.onOrderStatusChanged.informOrder)) {
            const informOrderActionAttributes: factory.action.interact.inform.IAttributes<any, any>[]
                = params.transaction.object.onOrderStatusChanged.informOrder.map(
                    (a) => {
                        return {
                            agent: params.transaction.seller,
                            object: params.order,
                            project: params.transaction.project,
                            // purpose: params.transaction,
                            recipient: {
                                id: params.transaction.agent.id,
                                name: params.transaction.agent.name,
                                typeOf: params.transaction.agent.typeOf,
                                ...a.recipient
                            },
                            typeOf: factory.actionType.InformAction
                        };
                    }
                );

            informOrderActionsOnSentOrder.push(...informOrderActionAttributes);
        }
    }

    return informOrderActionsOnSentOrder;
}
