const domain = require('../lib');
const moment = require('moment');

async function main() {
    await domain.mongoose.connect(process.env.MONGOLAB_URI);

    const placeRepo = new domain.repository.Place(domain.mongoose.connection);
    const placeService = new domain.chevre.service.Place({
        endpoint: process.env.CHEVRE_ENDPOINT,
        auth: new domain.chevre.auth.ClientCredentials({
            domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.CHEVRE_CLIENT_ID,
            clientSecret: process.env.CHEVRE_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });

    await domain.service.masterSync.importMovieTheater(
        '118',
    )({
        place: placeRepo,
        placeService: placeService
    });

    await domain.mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
