/**
 * 予約サービス
 * 予約の保管先はChevreサービスです。
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as factory from '@cinerino/factory';

import { handleChevreError } from '../errorHandler';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.chevre.reservationType>>;
type ISearchScreeningEventReservationsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    reservationService: chevre.service.Reservation;
}) => Promise<T>;

/**
 * 上映イベント予約検索
 */
export function searchScreeningEventReservations(params: {
    personId: string;
    ownedAt: Date;
}): ISearchScreeningEventReservationsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        reservationService: chevre.service.Reservation;
    }) => {
        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 所有権検索
            const ownershipInfos = await repos.ownershipInfo.search({
                goodType: factory.chevre.reservationType.EventReservation,
                ownedBy: params.personId,
                ownedAt: params.ownedAt
            });
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
