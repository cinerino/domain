const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../../');

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
    clientId: process.env.CHEVRE_CLIENT_ID,
    clientSecret: process.env.CHEVRE_CLIENT_SECRET,
    scopes: [],
    state: ''
});

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const projectRepo = new domain.repository.Project(mongoose.connection);
    const project = await projectRepo.findById({ id: '' });

    const productService = new domain.chevre.service.Product({
        endpoint: project.settings.chevre.endpoint,
        auth: chevreAuthClient
    });

    const searchMembershipServicesResult = await productService.search({
        project: { id: { $eq: project.id } },
        typeOf: { $eq: 'MembershipService' }
    });
    console.log('products found', searchMembershipServicesResult);

    const membershipService = searchMembershipServicesResult.data[0];

    const offers = await productService.searchOffers({
        id: membershipService.id
    });
    console.log('offers found', offers);
    console.log(offers[0].priceSpecification.priceComponent);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
