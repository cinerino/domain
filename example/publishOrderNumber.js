const domain = require('../lib');
const moment = require('moment');

async function main() {
    const redisClient = await domain.redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY,
        tls: { servername: process.env.REDIS_TLS_SERVERNAME }
    });;

    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);

    const orderNumbers = await Promise.all([...Array(10)].map(async () => {
        return orderNumberRepo.publishByTimestamp({
            project: { id: 'CINERINO' },
            orderDate: moment().toDate()
        });
    }));
    console.log('orderNumbers published', orderNumbers);
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
