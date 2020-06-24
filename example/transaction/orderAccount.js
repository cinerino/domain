const moment = require('moment');
const mongoose = require('mongoose');
const redis = require('redis');
const domain = require('../../');

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
    clientId: process.env.CHEVRE_CLIENT_ID,
    clientSecret: process.env.CHEVRE_CLIENT_SECRET,
    scopes: [],
    state: ''
});

const userPoolId = process.env.COGNITO_USER_POOL_ID;

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);
    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY
    });

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
    const projectRepo = new domain.repository.Project(mongoose.connection);
    const registerActionInProgressRepo = new domain.repository.action.RegisterServiceInProgress(redisClient);
    const sellerRepo = new domain.repository.Seller(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
    const personRepo = new domain.repository.Person({
        userPoolId: userPoolId
    });

    const project = await projectRepo.findById({ id: 'cinerino' });

    const productService = new domain.chevre.service.Product({
        endpoint: project.settings.chevre.endpoint,
        auth: chevreAuthClient
    });

    const searchProductsResult = await productService.search({
        project: { id: { $eq: project.id } },
        typeOf: { $eq: 'Account' }
    });
    console.log('products found', searchProductsResult);

    await domain.service.transaction.orderAccount.orderAccount({
        project: { id: project.id },
        // expires: moment().add(5, 'minutes').toDate(),
        agent: {
            typeOf: domain.factory.personType.Person,
            id: '3c081226-6172-49ac-86b0-0b0a4075c3df',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
        },
        accountType: 'Point',
        seller: {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: '59d20831e53ebc2b4e774466'
        }
    })({
        action: actionRepo,
        orderNumber: orderNumberRepo,
        ownershipInfo: ownershipInfoRepo,
        person: personRepo,
        registerActionInProgress: registerActionInProgressRepo,
        project: projectRepo,
        seller: sellerRepo,
        transaction: transactionRepo
    });
    console.log('ordered');
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
