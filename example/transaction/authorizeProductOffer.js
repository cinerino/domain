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

    const accountNumberRepo = new domain.repository.AccountNumber(redisClient);
    const actionRepo = new domain.repository.Action(mongoose.connection);
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
    const projectRepo = new domain.repository.Project(mongoose.connection);
    const registerActionInProgressRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
    const confirmationNumberRepo = new domain.repository.ConfirmationNumber(redisClient);

    const project = await projectRepo.findById({ id: 'cinerino' });

    const productService = new domain.chevre.service.Product({
        endpoint: project.settings.chevre.endpoint,
        auth: chevreAuthClient
    });

    const searchProductsResult = await productService.search({
        project: { id: { $eq: project.id } },
        // typeOf: { $eq: 'PaymentCard' }
        typeOf: { $eq: 'MembershipService' }
    });
    console.log('products found', searchProductsResult);

    const product = searchProductsResult.data[0];

    const offers = await productService.searchOffers({
        id: product.id
    });
    console.log('offers found', offers);
    const selectedOffer = offers[0];

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
            id: '59d20831e53ebc2b4e774466'
        },
        object: {
            clientUser: {}
        }
    })({
        project: projectRepo,
        transaction: transactionRepo
    });
    console.log('transaction started', transaction);

    const accessCode = '123';
    const serviceOutputName = 'サンプルプロダクト名称';

    const authorizeAction = await domain.service.offer.product.authorize({
        project: { id: project.id },
        object: [{
            id: selectedOffer.id,
            itemOffered: {
                id: product.id,
                serviceOutput: {
                    accessCode: accessCode,
                    name: serviceOutputName,
                    additionalProperty: [
                        { name: 'sampleName', value: 'sampleValue' }
                    ]
                }
            }
        }],
        agent: {
            id: transaction.agent.id
        },
        transaction: {
            id: transaction.id
        }

    })({
        accountNumber: accountNumberRepo,
        action: actionRepo,
        ownershipInfo: ownershipInfoRepo,
        project: projectRepo,
        registerActionInProgress: registerActionInProgressRepo,
        transaction: transactionRepo
    });
    console.log('authorized.', authorizeAction);
    // await mongoose.disconnect();

    // await domain.service.offer.product.voidTransaction({
    //     id: authorizeAction.id,
    //     agent: { id: transaction.agent.id },
    //     purpose: { typeOf: transaction.typeOf, id: transaction.id }
    // })({
    //     action: actionRepo,
    //     registerActionInProgress: registerActionInProgressRepo,
    //     transaction: transactionRepo
    // });
    // console.log('canceled.', authorizeAction.id);
    // return;

    await domain.service.transaction.updateAgent({
        typeOf: transaction.typeOf,
        id: transaction.id,
        agent: {
            id: transaction.agent.id,
            givenName: 'タロウ',
            familyName: 'モーション',
            email: 'hello@motionpicture.jp',
            telephone: '+819012345678'
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
                                    about: `${serviceOutputName}のご注文`
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
        transaction: transactionRepo,
        orderNumber: orderNumberRepo,
        confirmationNumber: confirmationNumberRepo
    });
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
