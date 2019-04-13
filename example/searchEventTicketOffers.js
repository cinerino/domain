const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const eventRepo = new domain.repository.Event(mongoose.connection);
    const sellerRepo = new domain.repository.Seller(mongoose.connection);
    const eventService = new domain.chevre.service.Event({
        endpoint: process.env.CHEVRE_ENDPOINT,
        auth: new domain.chevre.auth.ClientCredentials({
            domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.CHEVRE_CLIENT_ID,
            clientSecret: process.env.CHEVRE_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });
    const offerService = new domain.chevre.service.Offer({
        endpoint: process.env.CHEVRE_ENDPOINT,
        auth: new domain.chevre.auth.ClientCredentials({
            domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.CHEVRE_CLIENT_ID,
            clientSecret: process.env.CHEVRE_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });

    const offers = await domain.service.offer.searchScreeningEventTicketOffers({
        event: { id: '11399100020190412502045' },
        seller: { typeOf: domain.factory.organizationType.MovieTheater, id: '' }
    })({
        event: eventRepo,
        seller: sellerRepo,
        eventService: eventService,
        offerService: offerService
    });
    console.log(offers);
    console.log(offers.length, 'offers found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
