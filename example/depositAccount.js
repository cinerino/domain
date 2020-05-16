const moment = require('moment');
const mongoose = require('mongoose');
const redis = require('redis');

const domain = require('../lib');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);
    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY
    });

    const projectRepo = new domain.repository.Project(mongoose.connection);
    const moneyTransferTransactionNumberRepo = new domain.repository.MoneyTransferTransactionNumber(redisClient);

    await domain.service.account.deposit({
        project: { id: 'sskts-development' },
        expires: moment().add(5, 'minutes').toDate(),
        agent: {
            typeOf: domain.factory.personType.Person,
            id: 'personId',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
            name: 'agentName'
        },
        recipient: {
            typeOf: domain.factory.personType.Person,
            id: 'recipientId',
            name: 'recipientName'
        },
        object: {
            clientUser: {},
            amount: 10,
            toLocation: { accountType: 'Point', accountNumber: '10030041020' },
            description: 'sample description'
        }
    })({
        project: projectRepo,
        moneyTransferTransactionNumber: moneyTransferTransactionNumberRepo
    });

    await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
