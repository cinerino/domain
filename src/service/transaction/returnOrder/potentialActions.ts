import * as factory from '../../../factory';

import { createCancelReservationActions } from './potentialActions/cancelReservation';
import { createInformOrderActionsOnReturn } from './potentialActions/informOrder';
import { createRefundAccountActions } from './potentialActions/refundAccount';
import { createRefundCreditCardActions } from './potentialActions/refundCreditCard';
import { createRefundMovieTicketActions } from './potentialActions/refundMovieTicket';
import { createReturnPointAwardActions } from './potentialActions/returnPointAward';
import { createSendEmailMessaegActionsOnReturn } from './potentialActions/sendEmailMessage';

export type IAction = factory.action.IAction<factory.action.IAttributes<factory.actionType, any, any>>;

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    actionsOnOrder: IAction[];
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    transaction: factory.transaction.returnOrder.ITransaction;
    // placeOrderTransaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.transaction.returnOrder.IPotentialActions> {
    const transaction = params.transaction;
    const order = params.order;

    // クレジットカード返金アクション
    const refundCreditCardActions = await createRefundCreditCardActions(params);

    // 口座返金アクション
    const refundAccountActions = await createRefundAccountActions(params);

    // ムビチケ着券返金アクション
    const refundMovieTicketActions = await createRefundMovieTicketActions(params);

    // ポイントインセンティブの数だけ、返却アクションを作成
    const returnPointAwardActions = await createReturnPointAwardActions(params);

    const cancelReservationActions = await createCancelReservationActions(params);

    const informOrderActionsOnReturn = await createInformOrderActionsOnReturn(params);

    // 返品後のEメール送信アクション
    const sendEmailMessaegActionsOnReturn = await createSendEmailMessaegActionsOnReturn(params);

    const returnOrderActionAttributes: factory.action.transfer.returnAction.order.IAttributes = {
        project: order.project,
        typeOf: factory.actionType.ReturnAction,
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
            project: order.project,
            ...<any>order.seller
        },
        potentialActions: {
            cancelReservation: cancelReservationActions,
            informOrder: informOrderActionsOnReturn,
            refundCreditCard: refundCreditCardActions,
            refundAccount: refundAccountActions,
            refundMGTicket: [],
            refundMovieTicket: refundMovieTicketActions,
            returnPointAward: returnPointAwardActions,
            sendEmailMessage: sendEmailMessaegActionsOnReturn
        }
    };

    return {
        returnOrder: [returnOrderActionAttributes]
    };
}
