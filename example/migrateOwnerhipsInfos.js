const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(connection);

    const cursor = await ownershipInfoRepo.ownershipInfoModel.find(
        {
            'project.id': { $exists: false },
            // 'typeOfGood.typeOf': { $exists: true, $eq: 'Account' }
            // 'project.id': { $exists: true, $eq: 'ttts-production' },
            ownedThrough: {
                $exists: true,
                $gte: moment().toDate(),
                // $lt: moment('2019-11-10T00:00:00+09:00').toDate()
            },
            // orderStatus: { $in: [domain.factory.orderStatus.OrderReturned] }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const ownershipInfo = doc.toObject();
        console.log(ownershipInfo.project);
        console.log(ownershipInfo.typeOfGood.typeOf);
        console.log(ownershipInfo.ownedFrom);

        const updated = await ownershipInfoRepo.ownershipInfoModel.findOneAndUpdate(
            { identifier: doc.identifier },
            {
                project: { typeOf: 'Project', id: 'sskts-production' }
            },
            { new: true }
        ).exec();

        console.log('added', updated.id, i);
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
