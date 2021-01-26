const mongoose = require('mongoose');
const redis = require('redis');
const domain = require('../../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const transactionRepo = new domain.repository.Transaction(mongoose.connection);

    const accountNumber = await domain.service.transaction.placeOrderInProgress.publishAwardAccountNumberIfNotExist({
        id: '5fdfe3f05241b0000a3a10f2',
    })({
        transaction: transactionRepo
    });
    console.log(accountNumber);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
