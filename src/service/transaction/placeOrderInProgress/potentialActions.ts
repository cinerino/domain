import { createConfirmReservationActions } from './potentialActions/confirmReservation';
import { createGivePointAwardActions } from './potentialActions/givePointAward';
import {
    createInformOrderOnPlacedActions,
    createInformOrderOnSentActions
} from './potentialActions/informOrder';
import { createMoneyTransferActions } from './potentialActions/moneyTransfer';
import { createPayAccountActions } from './potentialActions/payAccount';
import { createPayCreditCardActions } from './potentialActions/payCreditCard';
import { createPayMovieTicketActions } from './potentialActions/payMovieTicket';
import { createPayPaymentCardActions } from './potentialActions/payPaymentCard';
import { createRegisterServiceActions } from './potentialActions/registerService';
import { createSendEmailMessageActions } from './potentialActions/sendEmailMessage';

import * as factory from '../../../factory';

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: factory.seller.ISeller;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    // 予約確定アクション
    const confirmReservationActions = await createConfirmReservationActions(params);

    const registerServiceActions = await createRegisterServiceActions(params);

    // 通貨転送アクション
    const moneyTransferActions = await createMoneyTransferActions(params);

    // 決済アクション
    const payCreditCardActions = await createPayCreditCardActions(params);
    const payAccountActions = await createPayAccountActions(params);
    const payMovieTicketActions = await createPayMovieTicketActions(params);
    const payPaymentCardActions = await createPayPaymentCardActions(params);
    const payActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType | string>[] = [
        ...payCreditCardActions,
        ...payAccountActions,
        ...payMovieTicketActions,
        ...payPaymentCardActions
    ];

    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
    const givePointAwardActions = await createGivePointAwardActions(params);

    // 注文配送メール送信設定
    const sendEmailMessageActions = await createSendEmailMessageActions(params);

    // 注文通知アクション
    const informOrderActionsOnPlaceOrder = await createInformOrderOnPlacedActions(params);
    const informOrderActionsOnSentOrder = await createInformOrderOnSentActions(params);

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        project: params.transaction.project,
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            confirmReservation: confirmReservationActions,
            informOrder: informOrderActionsOnSentOrder,
            moneyTransfer: moneyTransferActions,
            registerService: registerServiceActions,
            sendEmailMessage: sendEmailMessageActions
        }
    };

    return {
        order: {
            project: params.transaction.project,
            typeOf: factory.actionType.OrderAction,
            object: params.order,
            agent: params.transaction.agent,
            potentialActions: {
                givePointAward: givePointAwardActions,
                informOrder: informOrderActionsOnPlaceOrder,

                pay: payActions,
                // payAccount: payAccountActions,
                // payCreditCard: payCreditCardActions,
                // payMovieTicket: payMovieTicketActions,
                // payPaymentCard: payPaymentCardActions,

                sendOrder: sendOrderActionAttributes
            },
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        }
    };
}
