import * as factory from '../../../factory';

import { createCancelReservationActions } from './potentialActions/cancelReservation';
import { createInformOrderActionsOnReturn } from './potentialActions/informOrder';
import { createRefundActions } from './potentialActions/refund';
// import { createRefundAccountActions } from './potentialActions/refundAccount';
// import { createRefundCreditCardActions } from './potentialActions/refundCreditCard';
// import { createRefundMovieTicketActions } from './potentialActions/refundMovieTicket';
import { createSendEmailMessaegActionsOnReturn } from './potentialActions/sendEmailMessage';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    orders: factory.order.IOrder[];
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
}): Promise<factory.transaction.returnOrder.IPotentialActions> {
    const transaction = params.transaction;

    let returnOrderActions: factory.action.transfer.returnAction.order.IAttributes[] = [];

    returnOrderActions = await Promise.all(params.orders.map(async (order) => {
        let returnOrderParams = params.potentialActions?.returnOrder;
        // 互換性維持対応
        if (!Array.isArray(returnOrderParams)) {
            returnOrderParams = [{ ...returnOrderParams, object: { orderNumber: params.orders[0]?.orderNumber } }];
        }

        const returnOrderActionParams = returnOrderParams?.find((p) => p.object?.orderNumber === order.orderNumber);

        // 返金アクション
        // const refundCreditCardActions = await createRefundCreditCardActions({ ...params, order, returnOrderActionParams });
        // const refundAccountActions = await createRefundAccountActions({ ...params, order, returnOrderActionParams });
        // const refundMovieTicketActions = await createRefundMovieTicketActions({ ...params, order, returnOrderActionParams });
        // const refundActions: factory.action.trade.refund.IAttributes[] = [
        //     ...refundCreditCardActions,
        //     ...refundAccountActions,
        //     ...refundMovieTicketActions
        // ];
        const refundActions = await createRefundActions({ ...params, order, returnOrderActionParams });

        // ポイントインセンティブの数だけ、返却アクションを作成(いったん保留)
        // const returnPointAwardActions = await createReturnPointAwardActions(params);
        const returnPointAwardActions: factory.action.transfer.returnAction.pointAward.IAttributes[] = [];

        const cancelReservationActions = await createCancelReservationActions({ ...params, order, returnOrderActionParams });

        const informOrderActionsOnReturn = await createInformOrderActionsOnReturn({ ...params, order, returnOrderActionParams });

        // 返品後のEメール送信アクション
        const sendEmailMessaegActionsOnReturn = await createSendEmailMessaegActionsOnReturn({ ...params, order, returnOrderActionParams });

        return {
            project: order.project,
            typeOf: <factory.actionType.ReturnAction>factory.actionType.ReturnAction,
            object: {
                project: order.project,
                typeOf: order.typeOf,
                seller: order.seller,
                customer: order.customer,
                confirmationNumber: order.confirmationNumber,
                orderNumber: order.orderNumber,
                price: order.price,
                priceCurrency: order.priceCurrency,
                orderDate: order.orderDate
            },
            agent: transaction.agent,
            recipient: {
                ...order.seller,
                project: { typeOf: order.project.typeOf, id: order.project.id }
            },
            potentialActions: {
                cancelReservation: cancelReservationActions,
                informOrder: informOrderActionsOnReturn,
                refund: refundActions,
                // refundCreditCard: refundCreditCardActions,
                // refundAccount: refundAccountActions,
                // refundMovieTicket: refundMovieTicketActions,
                returnPointAward: returnPointAwardActions,
                sendEmailMessage: sendEmailMessaegActionsOnReturn
            }
        };
    }));

    return {
        returnOrder: returnOrderActions
    };
}
