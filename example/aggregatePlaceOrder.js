const domain = require('../lib');
const moment = require('moment');

async function main() {
    await domain.mongoose.connect(process.env.MONGOLAB_URI);

    const telemetryRepo = new domain.repository.Telemetry(domain.mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
    const now = moment(moment().add(-1, 'month').format('YYYY-MM-DDTHH:mm:00Z')).toDate();
    const fromNow = moment().diff(moment(now), 'minutes');
    console.log('fromNow:', fromNow);
    for (i = 0; i < fromNow; i++) {
        const measureFrom = moment(now).add(i, 'minutes').toDate();
        const measureThrough = moment(measureFrom).add(1, 'minute').toDate();
        await domain.service.report.telemetry.aggregatePlaceOrder({ measureFrom, measureThrough })({
            telemetry: telemetryRepo,
            transaction: transactionRepo
        });
    }

    await domain.mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
