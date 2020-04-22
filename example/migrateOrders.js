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
            'project.id': { $exists: true, $eq: 'sskts-production' },
            orderDate: {
                $gte: moment('2020-04-22T00:00:00+09:00').toDate(),
                // $lt: moment('2020-04-22T00:00:00+09:00').toDate()
                // $lt: moment('2020-04-22T00:00:00+09:00').toDate()
            }
            // orderStatus: { $in: [domain.factory.orderStatus.OrderReturned] }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .sort({ orderDate: 1 })
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const order = doc.toObject();
        const orderNumber = order.orderNumber;
        console.log('migrating order...', order.orderNumber, order.orderDate);

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

        // 注文アクション検索
        const orderActions = await oldActionRepo.search({
            typeOf: domain.factory.actionType.OrderAction,
            object: {
                orderNumber: {
                    $in: [orderNumber]
                }
            }
        });
        console.log(orderActions.length, 'orderActions found');

        // 返品アクション検索
        const returnActions = await oldActionRepo.search({
            typeOf: domain.factory.actionType.ReturnAction,
            object: {
                orderNumber: {
                    $in: [orderNumber]
                }
            }
        });
        console.log(returnActions.length, 'returnActions found');

        // 注文移行(ステータス変更されるので要調整)
        delete order._id;
        delete order.id;
        await orderRepo.orderModel.updateOne(
            { orderNumber: orderNumber },
            { $setOnInsert: { ...order } },
            // order,
            { upsert: true }
        ).exec();

        // 注文取引移行
        await Promise.all(placeOrderTransactions.map(async (t) => {
            delete t._id;
            delete t.id;
            await transactionRepo.transactionModel.updateOne(
                {
                    typeOf: domain.factory.transactionType.PlaceOrder,
                    'result.order.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...t } },
                { upsert: true }
            ).exec();
        }));

        // 注文返品取引移行
        await Promise.all(returnOrderTransactions.map(async (t) => {
            delete t._id;
            delete t.id;
            await transactionRepo.transactionModel.updateOne(
                {
                    typeOf: domain.factory.transactionType.ReturnOrder,
                    'object.order.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...t } },
                { upsert: true }
            ).exec();
        }));

        // インボイス移行
        await Promise.all(invoices.map(async (invoice) => {
            delete invoice._id;
            delete invoice.id;
            await invoiceRepo.invoiceModel.updateOne(
                {
                    'referencesOrder.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...invoice } },
                { upsert: true }
            ).exec();
        }));

        // 決済アクション移行
        await Promise.all(payActions.map(async (payAction) => {
            delete payAction._id;
            delete payAction.id;
            await actionRepo.actionModel.updateOne(
                {
                    typeOf: domain.factory.actionType.PayAction,
                    'purpose.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...payAction } },
                { upsert: true }
            ).exec();
        }));

        // 注文アクション移行
        await Promise.all(orderActions.map(async (orderAction) => {
            delete orderAction._id;
            delete orderAction.id;
            await actionRepo.actionModel.updateOne(
                {
                    typeOf: domain.factory.actionType.OrderAction,
                    'object.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...orderAction } },
                { upsert: true }
            ).exec();
        }));

        // 返品アクション移行
        await Promise.all(returnActions.map(async (returnAction) => {
            delete returnAction._id;
            delete returnAction.id;
            await actionRepo.actionModel.updateOne(
                {
                    typeOf: domain.factory.actionType.ReturnAction,
                    'object.orderNumber': { $exists: true, $eq: orderNumber }
                },
                { $setOnInsert: { ...returnAction } },
                { upsert: true }
            ).exec();
        }));

        console.log('added', orderNumber, i);
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
