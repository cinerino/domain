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

    result = await taskRepo.taskModel.deleteMany({
        runsAt: { $lt: startThrough },
        status: { $ne: domain.factory.taskStatus.Ready }
    })
        .exec();
    console.log('tasks deleted', result);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
