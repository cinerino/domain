import { MongoRepository as OrganizationRepo } from '../repo/organization';

import * as chevre from '../chevre';
import * as factory from '../factory';

type ISearchScreeningEventTicketOffersOperation<T> = (repos: {
    organization: OrganizationRepo;
    eventService: chevre.service.Event;
}) => Promise<T>;

/**
 * 上映イベントに対する券種オファーを検索する
 */
export function searchScreeningEventTicketOffers(params: {
    event: { id: string };
    seller: { typeOf: factory.organizationType; id: string };
    store: { id: string };
}): ISearchScreeningEventTicketOffersOperation<factory.chevre.event.screeningEvent.ITicketOffer[]> {
    return async (repos: {
        organization: OrganizationRepo;
        eventService: chevre.service.Event;
    }) => {
        // Chevreで券種オファーを検索
        let offers = await repos.eventService.searchScreeningEventTicketOffers({ eventId: params.event.id });

        // 店舗条件によって対象を絞る
        if (params.seller.typeOf !== factory.organizationType.MovieTheater) {
            throw new factory.errors.Argument('seller', `Seller type ${params.seller.typeOf} not acceptable`);
        }
        const seller = await repos.organization.findById({ typeOf: params.seller.typeOf, id: params.seller.id });
        if (Array.isArray(seller.areaServed)) {
            const store = seller.areaServed.find((area) => area.id === params.store.id);
            // 販売者の店舗に登録されていなければNotFound
            if (store === undefined) {
                throw new factory.errors.NotFound('Seller');
            }

            // 店舗タイプによって、利用可能なオファーを絞る
            const availabilityAccepted: factory.chevre.itemAvailability[] = [factory.chevre.itemAvailability.InStock];
            switch (store.typeOf) {
                case factory.placeType.Online:
                    availabilityAccepted.push(factory.chevre.itemAvailability.OnlineOnly);
                    break;
                case factory.placeType.Store:
                    availabilityAccepted.push(factory.chevre.itemAvailability.InStoreOnly);
                    break;
                default:
            }
            offers = offers.filter((o) => availabilityAccepted.indexOf(o.availability) >= 0);
        }

        return offers;
    };
}
