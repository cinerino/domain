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

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);

    let result;

    result = await ownershipInfoRepo.ownershipInfoModel.deleteMany({
        ownedFrom: { $lt: startThrough },
        ownedThrough: { $exists: true, $lt: now }
    })
        .exec();
    console.log('actions deleted', result);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
