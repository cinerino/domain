import * as moment from 'moment-timezone';

import { factory } from '../../../factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;

export function createReservationOwnershipInfo(params: {
    project: { typeOf: factory.chevre.organizationType.Project; id: string };
    ownedBy: factory.ownershipInfo.IOwner;
    acceptedOffer: factory.order.IAcceptedOffer<factory.order.IReservation>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    const itemOffered = params.acceptedOffer.itemOffered;

    let ownershipInfo: IOwnershipInfo;

    // イベント予約に対する所有権の有効期限はイベント終了日時までで十分だろう
    // 現時点では所有権対象がイベント予約のみなので、これで問題ないが、
    // 対象が他に広がれば、有効期間のコントロールは別でしっかり行う必要があるだろう
    const ownedThrough = moment(itemOffered.reservationFor.endDate)
        .toDate();

    let bookingService = params.acceptedOffer.offeredThrough;
    if (bookingService === undefined) {
        // デフォルトブッキングサービスはChevre
        bookingService = {
            typeOf: 'WebAPI',
            identifier: factory.service.webAPI.Identifier.Chevre
        };
    }

    if (bookingService.identifier === factory.service.webAPI.Identifier.COA) {
        // COA予約の場合、typeOfGoodにはアイテムをそのまま挿入する
        ownershipInfo = {
            project: params.project,
            id: '',
            typeOf: 'OwnershipInfo',
            identifier: params.identifier,
            ownedBy: params.ownedBy,
            acquiredFrom: params.acquiredFrom,
            ownedFrom: params.ownedFrom,
            ownedThrough: ownedThrough,
            typeOfGood: { ...itemOffered, bookingService: bookingService }
        };
    } else {
        ownershipInfo = {
            project: params.project,
            typeOf: 'OwnershipInfo',
            id: '',
            identifier: params.identifier,
            ownedBy: params.ownedBy,
            acquiredFrom: params.acquiredFrom,
            ownedFrom: params.ownedFrom,
            ownedThrough: ownedThrough,
            typeOfGood: {
                typeOf: itemOffered.typeOf,
                id: itemOffered.id,
                reservationNumber: itemOffered.reservationNumber,
                bookingService: bookingService,
                ...(typeof itemOffered.issuedThrough?.typeOf === 'string')
                    ? { issuedThrough: itemOffered.issuedThrough }
                    : undefined
            }
        };
    }

    return ownershipInfo;
}
