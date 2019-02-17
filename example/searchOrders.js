/**
 * 注文検索サンプル
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const orderRepo = new domain.repository.Order(mongoose.connection);
    const orders = await orderRepo.search({
        orderDateFrom: moment().add(-3, 'days').toDate(),
        orderDateThrough: moment().toDate()
    });
    console.log(orders.length, 'orders found.');

    // const res = await orderRepo.orderModel.find({
    //     $and: [
    //         { orderDate: { $gte: moment().add(-3, 'days').toDate() } },
    //         { orderDate: { $lte: moment().toDate() } },
    //         { confirmationNumber: { $in: ['0', '517205'] } },
    //         // { orderStatus: { $in: [domain.factory.orderStatus.OrderDelivered] } },
    //         {
    //             'paymentMethods.typeOf': {
    //                 $exists: true,
    //                 $in: [domain.factory.paymentMethodType.CreditCard, domain.factory.paymentMethodType.MovieTicket]
    //             }
    //         }
    //     ]
    // })
    //     .sort({ orderDate: -1 })
    //     .explain();
    // console.log(res[0].executionStats.allPlansExecution.map((e) => e.executionStages));

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
