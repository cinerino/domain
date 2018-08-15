const domain = require('../lib');
const moment = require('moment');

async function main() {
    await domain.mongoose.connect(process.env.MONGOLAB_URI);

    const eventRepo = new domain.repository.Event(domain.mongoose.connection);
    const placeRepo = new domain.repository.Place(domain.mongoose.connection);
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

    await domain.service.masterSync.importScreeningEvents(
        '', moment().add(-1, 'week').toDate, moment().add(1, 'week').toDate
    )({
        event: eventRepo,
        place: placeRepo,
        eventService: eventService
    });

    await domain.mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
