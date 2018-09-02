/**
 * 在庫管理(在庫数調整)サービス
 */
import * as factory from '@cinerino/factory';
// import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../repo/action';

// const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 資産承認解除(COA座席予約)
 * @param transactionId 取引ID
 */
export function cancelSeatReservationAuth(_: string) {
    return async (__: { action: ActionRepo }) => {
        // 座席仮予約アクションを取得
        // const authorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>
        //     await repos.action.findAuthorizeByTransactionId(
        //         transactionId
        //     ).then((actions) => actions
        //         .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
        //         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        //     );

        // await Promise.all(authorizeActions.map(async (action) => {
        //     debug('calling deleteTmpReserve...');
        //     const updTmpReserveSeatArgs =
        //         (<factory.action.authorize.offer.seatReservation.IResult>action.result).updTmpReserveSeatArgs;
        //     const updTmpReserveSeatResult =
        //         (<factory.action.authorize.offer.seatReservation.IResult>action.result).updTmpReserveSeatResult;

        //     await COA.services.reserve.delTmpReserve({
        //         theaterCode: updTmpReserveSeatArgs.theaterCode,
        //         dateJouei: updTmpReserveSeatArgs.dateJouei,
        //         titleCode: updTmpReserveSeatArgs.titleCode,
        //         titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
        //         timeBegin: updTmpReserveSeatArgs.timeBegin,
        //         tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum
        //     });
        // }));
    };
}
