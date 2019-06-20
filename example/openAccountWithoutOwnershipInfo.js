/**
 * 口座開設サンプル
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const redisClient = await domain.redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY,
        tls: { servername: process.env.REDIS_TLS_SERVERNAME }
    });;

    const account = await domain.service.account.openWithoutOwnershipInfo({
        project: { typeOf: 'Project', id: 'sskts-test' },
        name: 'グランドシネマサンシャインテスト',
        accountType: domain.factory.accountType.Point
    })({
        accountNumber: new domain.repository.AccountNumber(redisClient),
        project: new domain.repository.Project(mongoose.connection)
    });
    console.log('account opened', account);
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
