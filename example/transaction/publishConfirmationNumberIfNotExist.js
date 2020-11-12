const mongoose = require('mongoose');
const redis = require('redis');
const domain = require('../../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY
    });
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const confirmationNumberRepo = new domain.repository.ConfirmationNumber(redisClient);

    await domain.service.transaction.placeOrderInProgress.publishConfirmationNumberIfNotExist({
        id: '5fab504c051015000ae56682',
        object: { orderDate: new Date() }
    })({
        transaction: transactionRepo,
        confirmationNumber: confirmationNumberRepo
    });

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
