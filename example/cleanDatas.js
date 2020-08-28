const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();
    const startThrough = moment(now)
        .add(-12, 'months')
        .toDate();

    console.log('deleting...startThrough:', startThrough);

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const taskRepo = new domain.repository.Task(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
    const orderRepo = new domain.repository.Order(mongoose.connection);

    let result;

    result = await actionRepo.actionModel.deleteMany({
        startDate: { $lt: startThrough }
    })
        .exec();
    console.log('actions deleted', result);

    result = await taskRepo.taskModel.deleteMany({
        runsAt: { $lt: startThrough }
    })
        .exec();
    console.log('tasks deleted', result);

    result = await transactionRepo.transactionModel.deleteMany({
        startDate: { $lt: startThrough }
    })
        .exec();
    console.log('transactions deleted', result);

    result = await invoiceRepo.invoiceModel.deleteMany({
        createdAt: { $lt: startThrough }
    })
        .exec();
    console.log('invoices deleted', result);

    result = await orderRepo.orderModel.deleteMany({
        orderDate: { $lt: startThrough }
    })
        .exec();
    console.log('orders deleted', result);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
