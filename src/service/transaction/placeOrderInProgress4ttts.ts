/**
 * ttts専用進行中注文取引サービス
 */
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
// import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { RedisRepository as TokenRepo } from '../../repo/token';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as SeatReservationAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4ttts';

import { createPotentialActions } from './placeOrderInProgress/potentialActions4ttts';
import { createOrder } from './placeOrderInProgress/result4ttts';

import * as PlaceOrderInProgressService from './placeOrderInProgress';

export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    orderNumber: OrderNumberRepo;
    transaction: TransactionRepo;
    token: TokenRepo;
}) => Promise<T>;

export import start = PlaceOrderInProgressService.start;
export import updateAgent = PlaceOrderInProgressService.updateAgent;

/**
 * 取引確定
 */
export function confirm(params: {
    id: string;
    agent?: {
        id?: string;
    };
    /**
     * 取引確定後アクション
     */
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    result: {
        order: {
            orderDate: Date;
            /**
             * 確認番号のカスタム指定
             */
            confirmationNumber?: string;
        };
    };
}): IConfirmOperation<factory.transaction.placeOrder.IResult> {
    return async (repos: {
        action: ActionRepo;
        orderNumber: OrderNumberRepo;
        token: TokenRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (params.agent !== undefined && typeof params.agent.id === 'string') {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: factory.transactionType.PlaceOrder,
                id: params.id
            }
        });

        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.result.order.orderDate));
        transaction.object.authorizeActions = authorizeActions;

        // 取引の確定条件が全て整っているかどうか確認
        PlaceOrderInProgressService.validateTransaction(transaction);
        // 注文取引成立条件を満たしているかどうか
        // if (!canBeClosed(transaction)) {
        //     throw new factory.errors.Argument('transactionId', 'Transaction cannot be confirmed because prices are not matched.');
        // }

        const orderNumber = await repos.orderNumber.publishByTimestamp({
            project: transaction.project,
            orderDate: params.result.order.orderDate
        });

        // 確認番号を発行
        let confirmationNumber = '0';

        // 確認番号の指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof params.result.order.confirmationNumber === 'string') {
            confirmationNumber = params.result.order.confirmationNumber;
        }

        // 注文作成
        const { order } = createOrder(confirmationNumber, orderNumber, transaction);
        const result: factory.transaction.placeOrder.IResult = { order };
        const potentialActions = await createPotentialActions({
            transaction: transaction,
            order: order,
            potentialActions: params.potentialActions
        });

        // ステータス変更
        try {
            await repos.transaction.confirm({
                typeOf: transaction.typeOf,
                id: transaction.id,
                authorizeActions: authorizeActions,
                result: result,
                potentialActions: potentialActions
            });
        } catch (error) {
            if (error.name === 'MongoError') {
                // 万が一同一注文番号で確定しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error collection: prodttts.transactions index:result.order.orderNumber_1 dup key:...',
                // code: 11000,
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['result.order.orderNumber']);
                }
            }

            throw error;
        }

        return result;
    };
}

/**
 * 取引が確定可能な状態かどうかをチェックする
 */
// function canBeClosed(
//     transaction: factory.transaction.placeOrder.ITransaction
// ) {
//     // customerとsellerで、承認アクションの金額が合うかどうか
//     const priceByAgent = transaction.object.authorizeActions
//         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
//         .filter((a) => a.agent.id === transaction.agent.id)
//         .reduce((a, b) => a + Number((<factory.action.authorize.paymentMethod.creditCard.IResult>b.result).amount), 0);
//     const priceBySeller = transaction.object.authorizeActions
//         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
//         .filter((a) => a.agent.id === transaction.seller.id)
//         // tslint:disable-next-line:max-line-length
// tslint:disable-next-line:max-line-length
//         .reduce((a, b) => a + (<factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>b.result).price, 0);

//     if (priceByAgent !== priceBySeller) {
//         throw new factory.errors.Argument('transactionId', 'Prices not matched between an agent and a seller.');
//     }

//     return true;
// }

/**
 * 取引に対するアクション
 */
export namespace action {
    /**
     * 取引に対する承認アクション
     */
    export namespace authorize {
        /**
         * 座席予約承認アクションサービス
         */
        export import seatReservation = SeatReservationAuthorizeActionService;
    }
}
