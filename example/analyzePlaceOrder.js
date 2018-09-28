const domain = require('../lib');
const moment = require('moment');

async function main() {
    await domain.mongoose.connect(process.env.MONGOLAB_URI);

    const telemetryRepo = new domain.repository.Telemetry(domain.mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
    const transactions = await transactionRepo.search({
        limit: 1,
        page: 1,
        typeOf: domain.factory.transactionType.PlaceOrder,
        statuses: [domain.factory.transactionStatusType.Confirmed],
        startFrom: moment().add(-1, 'week').toDate()
    });
    console.log('analyzing:', transactions[0]);
    await domain.service.report.telemetry.analyzePlaceOrder({
        transaction: transactions[0]
    })({
        telemetry: telemetryRepo
    });

    await domain.mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
