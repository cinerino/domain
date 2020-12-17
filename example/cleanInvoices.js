const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();
    const startThrough = moment(now)
        .add(-18, 'months')
        .toDate();

    console.log('deleting...startThrough:', startThrough);

    const invoiceRepo = new domain.repository.Invoice(mongoose.connection);

    let result;

    result = await invoiceRepo.invoiceModel.deleteMany({
        createdAt: { $lt: startThrough }
    })
        .exec();
    console.log('invoices deleted', result);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
