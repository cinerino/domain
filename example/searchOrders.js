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
        orderDateThrough: moment().toDate(),
        // paymentMethods: {
        //     typeOfs: [domain.factory.paymentMethodType.MovieTicket],
        //     paymentMethodIds: ['xxx']
        // },
        // seller: { ids: ['xxx'] },
        // customer: {
        //     ids: ['xxx'],
        //     identifiers: [{ name: '', value: '' }],
        //     givenName: 'xxx'
        // },
        // acceptedOffers: {
        //     itemOffered: {
        //         ids: ['xxx'],
        //         reservationFor: { ids: ['xxx'] }
        //     }
        // },
        sort: { orderDate: -1 }
    });
    console.log(orders);
    console.log(orders.length, 'orders found.');
    console.log(typeof orders[0].id);
    console.log(typeof orders[0].acceptedOffers);
    console.log(orders[0].orderDate instanceof Date);

    // const res = await orderRepo.orderModel.find({
    //     $and: [
    //         { orderDate: { $gte: moment().add(-3, 'days').toDate() } },
    //         { orderDate: { $lte: moment().toDate() } },
    //         { confirmationNumber: { $in: ['0', '517205'] } },
    //         {
    //             'paymentMethods.typeOf': {
    //                 $exists: true,
    //                 $in: [domain.factory.paymentMethodType.CreditCard, domain.factory.paymentMethodType.MovieTicket]
    //             }
    //         },
    //         {
    //             'customer.identifier': {
    //                 $exists: true,
    //                 $in: [
    //                     { name: 'clientId', value: 'xxx' }
    //                 ]

    //             }
    //         }
    //     ]
    // })
    //     .sort({ orderDate: 1 })
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
