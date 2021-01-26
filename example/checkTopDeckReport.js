/**
 * 未来のイベントに対して注文があるかどうかを確認する
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: domain.credentials.chevre.authorizeServerDomain,
    clientId: domain.credentials.chevre.clientId,
    clientSecret: domain.credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const eventService = new domain.chevre.service.Event({
        endpoint: domain.credentials.chevre.endpoint,
        auth: chevreAuthClient
    });
    const events = [];
    let count = 100;
    const limit = 100;
    let page = 0;
    while (count >= limit) {
        page += 1;

        const searchEventsResult = await eventService.search({
            limit,
            page,
            project: { ids: ['cinerino'] },
            typeOf: domain.chevre.factory.eventType.ScreeningEvent,
            eventStatuses: [domain.chevre.factory.eventStatusType.EventScheduled],
            startFrom: moment('2020-12-24T00:00:00+09:00')
                .toDate(),
            // startThrough: moment('2021-01-17T00:00:00+09:00')
            //     .toDate()
        });
        count = searchEventsResult.data.length;
        console.log('page / count:', page, count);
        events.push(...searchEventsResult.data);
    }

    // console.log(events);
    console.log(events.length, 'events found');

    const orderRepo = new domain.repository.Order(mongoose.connection);

    let orders = [];
    for (const event of events) {
        orders = await orderRepo.search({
            orderDateFrom: moment('2020-09-24T00:00:00+09:00')
                .toDate(),
            orderDateThrough: moment('2020-10-17T00:00:00+09:00')
                .toDate(),
            acceptedOffers: {
                itemOffered: {
                    reservationFor: { ids: [event.id] }
                }
            }
        });
        // console.log(orders);
        if (orders.length > 0) {
            console.log(orders.length, 'orders found. event:', event.id);
        } else {
            // console.log('no orders');
        }
    }
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
