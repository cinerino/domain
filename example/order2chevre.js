const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const orderRepo = new domain.repository.Order(connection);

    const cursor = await orderRepo.orderModel.find(
        {
            // 'project.id': { $exists: true, $eq: '' },
            orderDate: {
                $gte: moment('2020-10-01T00:00:00+09:00').toDate(),
                // $lte: moment('2020-04-26T00:00:00+09:00').toDate(),
                // $gte: moment('2021-04-01T00:00:00+09:00').toDate(),
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        // 最近のデータから移行する
        .sort({ orderDate: -1 })
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const order = doc.toObject();
        const orderNumber = order.orderNumber;
        console.log('migrating order...', order.orderNumber, order.orderDate);

        // 注文移行(ステータス変更されるので要調整)
        delete order._id;
        delete order.id;
        await orderRepo.createIfNotExist(order);

        console.log('migrated', orderNumber, order.orderDate, i);
    });

    console.log(i, 'orders migrated');
    // await mongoose.disconnect();
}

main()
    .then(() => {
        console.log('success!');
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
