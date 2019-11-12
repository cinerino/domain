const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const orderRepo = new domain.repository.Order(connection);

    const cursor = await orderRepo.orderModel.find(
        {
            'project.id': { $exists: true, $eq: 'ttts-production' },
            orderDate: {
                $gte: moment('2019-08-01T00:00:00+09:00').toDate(),
                // $lt: moment('2019-11-10T07:38:37+00:00').toDate()
            },

        },
        { orderNumber: 1, confirmationNumber: 1, 'customer.telephone': 1, identifier: 1 }
    )
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const order = doc.toObject();
        const orderNumber = order.orderNumber;

        const identifier = [
            {
                name: 'confirmationNumber',
                value: String(order.confirmationNumber)
            },
            {
                name: 'confirmationPass',
                value: String(order.customer.telephone).slice(-4)
            }
        ];

        if (!Array.isArray(order.identifier) || order.identifier.length === 0) {
            console.log('updating...', order.orderNumber);
            console.log(identifier);
            await orderRepo.orderModel.updateOne(
                { orderNumber: orderNumber },
                { identifier: identifier }
            ).exec();
        }

        console.log('updated', orderNumber, i);
    });

    console.log(i, 'orders updated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
