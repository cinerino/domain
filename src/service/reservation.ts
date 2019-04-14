/**
 * 予約サービス
 * 予約の保管先はChevre | COAです
 */
import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import { handleChevreError } from '../errorHandler';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

type IReservation = factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation>;

type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.chevre.reservationType>>;

export type ISearchScreeningEventReservationsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    reservationService: chevre.service.Reservation;
}) => Promise<T>;

/**
 * 予約を確定する
 */
export function confirmReservation(params: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>) {
    return async (repos: {
        action: ActionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        // アクション開始
        const confirmActionAttributes = params;
        const action = await repos.action.start(confirmActionAttributes);

        try {
            let object = confirmActionAttributes.object;
            if (params.instrument === undefined) {
                params.instrument = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }
            switch (params.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // COA本予約
                    // 未本予約であれば実行(COA本予約は一度成功すると成功できない)
                    object = <factory.action.interact.confirm.reservation.IObject4COA>object;

                    // リトライ可能な前提でつくる必要があるので、要注意
                    // すでに本予約済みかどうか確認
                    const stateReserveResult = await COA.services.reserve.stateReserve({
                        theaterCode: object.theaterCode,
                        reserveNum: object.tmpReserveNum,
                        telNum: object.telNum
                    });

                    if (stateReserveResult === null) {
                        await COA.services.reserve.updReserve(object);
                    }

                    break;

                default:
                    // 座席予約確定
                    object = <factory.action.interact.confirm.reservation.IObject4Chevre>object;
                    await repos.reserveService.confirm(object);
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: confirmActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const result: factory.action.interact.confirm.reservation.IResult = {
        };
        await repos.action.complete({ typeOf: confirmActionAttributes.typeOf, id: action.id, result: result });
    };
}

/**
 * イベント予約検索
 */
export function searchScreeningEventReservations(
    params: factory.ownershipInfo.ISearchConditions<factory.chevre.reservationType.EventReservation>
): ISearchScreeningEventReservationsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        reservationService: chevre.service.Reservation;
    }) => {
        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 所有権検索
            const ownershipInfos = await repos.ownershipInfo.search(params);

            // Chevre予約の場合、詳細を取得
            const reservationIds = ownershipInfos
                .filter((o) => {
                    return o.typeOfGood.bookingService === undefined
                        || o.typeOfGood.bookingService.identifier === factory.service.webAPI.Identifier.Chevre;
                })
                .map((o) => o.typeOfGood.id);

            let chevreReservations: IReservation[] = [];
            if (reservationIds.length > 0) {
                const searchReservationsResult = await repos.reservationService.search({
                    typeOf: factory.chevre.reservationType.EventReservation,
                    ids: reservationIds
                });
                chevreReservations = searchReservationsResult.data;
            }

            ownershipInfosWithDetail = ownershipInfos.map((o) => {
                let reservation = chevreReservations.find((r) => r.id === o.typeOfGood.id);
                if (reservation === undefined) {
                    // COA予約の場合、typeOfGoodに詳細も含まれる
                    reservation = <IReservation>o.typeOfGood;
                    // throw new factory.errors.NotFound('Reservation');
                }

                return { ...o, typeOfGood: reservation };
            });
        } catch (error) {
            error = handleChevreError(error);
            throw error;
        }

        return ownershipInfosWithDetail;
    };
}
