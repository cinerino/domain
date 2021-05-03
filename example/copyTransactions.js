const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    // create index
    await mongoose.connect(process.env.MONGOLAB_URI, {
        autoIndex: true,
        useCreateIndex: true,
    });

    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI, {
        autoIndex: true,
        useCreateIndex: true,
    });

    const oldTransactionRepo = new domain.repository.Transaction(oldConnection);
    const transactionRepo = new domain.repository.Transaction(connection);

    const cursor = await oldTransactionRepo.transactionModel.find(
        {
            // 'project.id': { $exists: true, $eq: 'sskts-production' },
            startDate: {
                $gte: moment('2020-04-01T00:00:00+09:00').toDate(),
                $lt: moment('2020-05-01T00:00:00+09:00').toDate(),
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .sort({ startDate: -1 })
        .cursor();
    console.log('transactions found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const transaction = doc.toObject();
        const transactionId = transaction.id;
        console.log('migrating transaction...', transactionId, transaction.startDate);

        // アクション移行
        delete transaction._id;
        delete transaction.id;
        await transactionRepo.transactionModel.findByIdAndUpdate(
            transactionId,
            { $setOnInsert: transaction },
            { upsert: true }
        )
            .exec();

        console.log('added', transactionId, transaction.startDate, i);
    });

    console.log(i, 'transactions migrated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
