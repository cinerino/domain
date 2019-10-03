/**
 * ttts専用進行中注文取引サービス
 */
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as SeatReservationAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4ttts';

import * as PlaceOrderInProgressService from './placeOrderInProgress';

export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    orderNumber: OrderNumberRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export import start = PlaceOrderInProgressService.start;
export import updateAgent = PlaceOrderInProgressService.updateAgent;
export import confirm = PlaceOrderInProgressService.confirm;

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
