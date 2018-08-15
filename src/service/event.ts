import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';

import { MongoRepository as EventRepository } from '../repo/event';

const debug = createDebug('cinerino-domain:*');

export type IEventOperation<T> = (repos: {
    event: EventRepository;
    // itemAvailability?: ScreeningEventItemAvailabilityRepository;
}) => Promise<T>;

/**
 * 個々の上映イベントを検索する
 * 在庫状況リポジトリーをパラメーターとして渡せば、在庫状況も取得してくれる
 */
export function searchScreeningEvents(
    searchConditions: factory.chevre.event.screeningEvent.ISearchConditions
): IEventOperation<factory.chevre.event.screeningEvent.IEvent[]> {
    return async (repos: {
        event: EventRepository;
    }) => {
        debug('finding screeningEvents...', searchConditions);
        const events = await repos.event.searchScreeningEvents(searchConditions);

        return Promise.all(events.map(async (event) => {
            // 空席状況情報を追加
            // const offer: factory.chevre.event.screeningEvent.IOffer = {
            //     typeOf: 'Offer',
            //     availability: null,
            //     url: ''
            // };
            const offer: any = {
                typeOf: 'Offer',
                availability: null,
                url: ''
            };
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            // if (repos.itemAvailability !== undefined) {
            //     offer.availability = await repos.itemAvailability.findOne(event.coaInfo.dateJouei, event.identifier);
            // }

            return { ...event, ...{ offer: offer } };
        }));
    };
}

/**
 * 個々の上映イベントを識別子で取得する
 */
export function findScreeningEventById(
    id: string
): IEventOperation<factory.chevre.event.screeningEvent.IEvent> {
    return async (repos: {
        event: EventRepository;
        // itemAvailability?: ScreeningEventItemAvailabilityRepository;
    }) => {
        const event = await repos.event.findScreeningEventById(id);

        // add item availability info
        // const offer: factory.chevre.event.screeningEvent.IOffer = {
        //     typeOf: 'Offer',
        //     availability: null,
        //     url: ''
        // };
        const offer: any = {
            typeOf: 'Offer',
            availability: null,
            url: ''
        };
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        // if (repos.itemAvailability !== undefined) {
        //     offer.availability = await repos.itemAvailability.findOne(event.coaInfo.dateJouei, event.identifier);
        // }

        return { ...event, ...{ offer: offer } };
    };
}
