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

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);
    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY
    });

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const projectRepo = new domain.repository.Project(mongoose.connection);
    const sellerRepo = new domain.repository.Seller(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);

    const project = await projectRepo.findById({ id: 'cinerino' });

    const productService = new domain.chevre.service.Product({
        endpoint: project.settings.chevre.endpoint,
        auth: chevreAuthClient
    });

    const transaction = await domain.service.transaction.placeOrderInProgress.start({
        project: { id: project.id },
        expires: moment().add(5, 'minutes').toDate(),
        agent: {
            typeOf: domain.factory.personType.Person,
            id: 'personId',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
        },
        seller: {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: '59d20831e53ebc2b4e774466'
        },
        object: {
            clientUser: {}
        }
    })({
        project: projectRepo,
        seller: sellerRepo,
        transaction: transactionRepo
    });
    console.log('transaction started', transaction);

    const identifier = `CIN${(new Date()).valueOf()}`;
    const accessCode = '123';

    const authorizeAction = await domain.service.offer.paymentCard.authorize({
        project: { id: project.id },
        object: {
            id: '',
            itemOffered: {
                id: '5eaf98ecbcba1736247577b0',
                serviceOutput: {
                    identifier: identifier,
                    accessCode: accessCode
                }
            }
        },
        agent: {
            id: transaction.agent.id
        },
        transaction: {
            id: transaction.id
        }

    })({
        action: actionRepo,
        project: projectRepo,
        seller: sellerRepo,
        transaction: transactionRepo
    });
    console.log('authorized.', authorizeAction);
    // await mongoose.disconnect();

    await domain.service.transaction.updateAgent({
        typeOf: transaction.typeOf,
        id: transaction.id,
        agent: {
            id: transaction.agent.id,
            givenName: 'タロウ',
            familyName: 'モーション',
            email: '',
            telephone: ''
        }
    })({
        transaction: transactionRepo
    })

    await domain.service.transaction.placeOrderInProgress.confirm({
        id: transaction.id,
        project: { id: project.id },
        agent: { id: transaction.agent.id },
        potentialActions: {
            order: {
                potentialActions: {
                    sendOrder: {
                        potentialActions: {
                            sendEmailMessage: [{
                                object: {
                                    about: 'プリペイドカードのご注文'
                                    // toRecipient: {
                                    // }
                                }
                            }]
                        }
                    }
                }
            }
        },
        result: {
            order: { orderDate: new Date() }
        }
    })({
        action: actionRepo,
        project: projectRepo,
        seller: sellerRepo,
        transaction: transactionRepo,
        orderNumber: orderNumberRepo
    });
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
