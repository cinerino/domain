const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const readable = await domain.service.report.transaction.stream({
        conditions: {
            typeOf: domain.factory.transactionType.PlaceOrder,
            sort: { startDate: domain.factory.sortType.Ascending },
            // startFrom: moment().add(-3, 'days').toDate()
        },
        format: domain.factory.encodingFormat.Application.json
        // format: domain.factory.encodingFormat.Text.csv
    })({
        transaction: transactionRepo
    });

    readable.on('data', function (data) {
        console.log(data);
    });
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
