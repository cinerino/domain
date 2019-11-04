const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const oldActionRepo = new domain.repository.Action(oldConnection);
    const oldInvoiceRepo = new domain.repository.Invoice(oldConnection);
    const oldOrderRepo = new domain.repository.Order(oldConnection);
    const oldTransactionRepo = new domain.repository.Transaction(oldConnection);

    const actionRepo = new domain.repository.Action(connection);
    const invoiceRepo = new domain.repository.Invoice(connection);
    const orderRepo = new domain.repository.Order(connection);
    const transactionRepo = new domain.repository.Transaction(connection);

    const cursor = await oldOrderRepo.orderModel.find(
        {
            'project.id': { $exists: true, $eq: 'ttts-production' },
            orderDate: {
                $gte: moment('2019-09-01T00:00:00+09:00').toDate(),
                $lt: moment('2019-09-01T03:00:00+09:00').toDate()
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const order = doc.toObject();
        const orderNumber = order.orderNumber;

        // 注文取引検索
        const placeOrderTransactions = await oldTransactionRepo.search({
            typeOf: domain.factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [orderNumber] }
            }
        });
        console.log(placeOrderTransactions.length, 'placeOrderTransactions found');

        // 注文返品取引検索
        const returnOrderTransactions = await oldTransactionRepo.search({
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: {
                order: { orderNumbers: [orderNumber] }
            }
        });
        console.log(returnOrderTransactions.length, 'returnOrderTransactions found');

        // インボイス検索
        const invoices = await oldInvoiceRepo.search({
            referencesOrder: { orderNumbers: [orderNumber] }
        });
        console.log(invoices.length, 'invoices found');

        // 決済アクション検索
        const payActions = await oldActionRepo.search({
            typeOf: domain.factory.actionType.PayAction,
            purpose: {
                orderNumber: {
                    $in: [orderNumber]
                }
            }
        });
        console.log(payActions.length, 'payActions found');


        // 注文移行
        await orderRepo.orderModel.updateOne(
            { orderNumber: order.orderNumber },
            { $setOnInsert: { ...order, _id: undefined, id: undefined } },
            { upsert: true }
        ).exec();

        // 注文取引移行
        await Promise.all(placeOrderTransactions.map(async (t) => {
            await transactionRepo.transactionModel.updateOne(
                {
                    typeOf: domain.factory.transactionType.PlaceOrder,
                    'result.order.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...t, _id: undefined, id: undefined } },
                { upsert: true }
            ).exec();
        }));

        // 注文返品取引移行
        await Promise.all(returnOrderTransactions.map(async (t) => {
            await transactionRepo.transactionModel.updateOne(
                {
                    typeOf: domain.factory.transactionType.ReturnOrder,
                    'object.order.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...t, _id: undefined, id: undefined } },
                { upsert: true }
            ).exec();
        }));

        // インボイス移行

        // 決済アクション移行

        console.log('added', order.orderNumber, i);
    });

    console.log(i, 'orders migrated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
