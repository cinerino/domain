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
    const projectRepo = new domain.chevre.service.Project(chevreAuthClient);
    const registerActionInProgressRepo = new domain.repository.action.RegisterServiceInProgress(redisClient);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const orderRepo = new domain.repository.Order(mongoose.connection);
    const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
    const taskRepo = new domain.repository.Task(mongoose.connection);
    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
    const personRepo = new domain.repository.Person({
        userPoolId: userPoolId
    });

    const productService = new domain.chevre.service.Product({
        endpoint: domain.credentials.chevre.endpoint,
        auth: chevreAuthClient
    });

    const searchProductsResult = await productService.search({
        project: { id: { $eq: 'cinerino' } },
        typeOf: { $eq: 'Account' }
    });
    console.log('products found', searchProductsResult);

    const result = await domain.service.transaction.orderAccount.orderAccount({
        project: { id: 'cinerino' },
        // expires: moment().add(5, 'minutes').toDate(),
        agent: {
            typeOf: domain.factory.personType.Person,
            id: '3c081226-6172-49ac-86b0-0b0a4075c3df',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
        },
        name: 'サンプル口座名義',
        accountType: 'Point',
        seller: {
            id: '59d20831e53ebc2b4e774466'
        }
    })({
        action: actionRepo,
        orderNumber: orderNumberRepo,
        ownershipInfo: ownershipInfoRepo,
        person: personRepo,
        registerActionInProgress: registerActionInProgressRepo,
        project: projectRepo,
        transaction: transactionRepo
    });
    console.log('ordered', result.order.orderNumber);


    const order = result.order;

    const orderActionAttributes = {
        agent: order.customer,
        object: order,
        potentialActions: {},
        project: order.project,
        typeOf: domain.factory.actionType.OrderAction
    };

    await domain.service.order.placeOrder(orderActionAttributes)({
        action: actionRepo,
        invoice: invoiceRepo,
        order: orderRepo,
        task: taskRepo,
        transaction: transactionRepo
    });
    console.log('order placed');


    // APIユーザーとして注文配送を実行する
    console.log('sending order...');
    const sendOrderActionAttributes = {
        agent: order.seller,
        object: order,
        potentialActions: {
            sendEmailMessage: undefined
        },
        project: order.project,
        recipient: order.customer,
        typeOf: domain.factory.actionType.SendAction
    };

    const ownershipInfos = await domain.service.delivery.sendOrder(sendOrderActionAttributes)({
        action: actionRepo,
        order: orderRepo,
        ownershipInfo: ownershipInfoRepo,
        registerActionInProgress: registerActionInProgressRepo,
        task: taskRepo,
        transaction: transactionRepo
    });
    console.log('order sent');
    console.log('ownershipInfos created', ownershipInfos);

}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
