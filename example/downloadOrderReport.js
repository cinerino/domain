const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const orderRepo = new domain.repository.Order(mongoose.connection);
    const readable = await domain.service.report.order.stream({
        conditions: {
            // project: { id: 'cinerino' },
            orderDate: {
                $gte: moment().add(-1, 'week').toDate(),
                $lte: moment().toDate(),
            }
        },
        // format: domain.factory.encodingFormat.Application.json
        format: domain.factory.encodingFormat.Text.csv
    })({
        order: orderRepo
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
