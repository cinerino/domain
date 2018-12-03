/**
 * 予約サービス
 * 予約の保管先はChevreです
 */
import * as chevre from '../chevre';
import * as factory from '../factory';

import { handleChevreError } from '../errorHandler';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.chevre.reservationType>>;
export type ISearchScreeningEventReservationsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    reservationService: chevre.service.Reservation;
}) => Promise<T>;

/**
 * 予約を確定する
 */
export function confirmReservation(params: factory.action.interact.confirm.reservation.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        // アクション開始
        const confirmActionAttributes = params;
        const action = await repos.action.start(confirmActionAttributes);

        try {
            // 座席予約確定
            await repos.reserveService.confirm(confirmActionAttributes.object);
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
 * 上映イベント予約検索
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

            const reservationIds = ownershipInfos.map((o) => o.typeOfGood.id);
            if (reservationIds.length > 0) {
                const searchReservationsResult = await repos.reservationService.searchScreeningEventReservations({
                    ids: reservationIds
                });
                ownershipInfosWithDetail = ownershipInfos.map((o) => {
                    const reservation = searchReservationsResult.data.find((r) => r.id === o.typeOfGood.id);
                    if (reservation === undefined) {
                        throw new factory.errors.NotFound('Reservation');
                    }

                    return { ...o, typeOfGood: reservation };
                });
            }
        } catch (error) {
            error = handleChevreError(error);
            throw error;
        }

        return ownershipInfosWithDetail;
    };
}
