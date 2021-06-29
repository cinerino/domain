const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const oldOwnershipInfoRepo = new domain.repository.OwnershipInfo(oldConnection);
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(connection);

    const cursor = await oldOwnershipInfoRepo.ownershipInfoModel.find(
        {
            'project.id': { $eq: '' },
            ownedFrom: {
                $exists: true,
                $gte: moment('2019-12-22T00:00:00+09:00').toDate(),
                $lte: moment('2020-01-22T00:00:00+09:00').toDate()
            },
            ownedThrough: {
                $exists: true,
                $lte: moment('2020-04-22T00:00:00+09:00').toDate()
                // $gte: moment('2020-04-22T00:00:00+09:00').toDate()
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .sort({ ownedFrom: 1 })
        .cursor();
    console.log('ownershipInfos found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const ownershipInfo = doc.toObject();
        const identifier = ownershipInfo.identifier;
        console.log('migrating ownershipInfo...', ownershipInfo.identifier, ownershipInfo.ownedFrom);

        // 所有権移行
        delete ownershipInfo._id;
        delete ownershipInfo.id;
        await ownershipInfoRepo.saveByIdentifier(ownershipInfo);

        console.log('added', identifier, i);
    });

    console.log(i, 'ownershipInfos migrated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
