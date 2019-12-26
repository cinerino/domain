/**
 * 注文検索サンプル
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const transactions = await transactionRepo.search({
        startDateFrom: moment().add(-3, 'days').toDate(),
        startDateThrough: moment().toDate(),
        typeOf: domain.factory.transactionType.PlaceOrder,
        seller: { ids: ['xxx'] },
        agent: {
            ids: ['xxx'],
            identifiers: [{ name: '', value: '' }]
        },
        sort: { startDate: -1 }
    });
    console.log(transactions.length, 'transactions found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
