const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(connection);

    const membershipFor4update = {
        typeOf: 'MembershipService',
        id: '5b1874be4e1537775703963e'
    };

    const cursor = await ownershipInfoRepo.ownershipInfoModel.find(
        {
            'project.id': { $exists: true, $eq: '' },
            'typeOfGood.typeOf': {
                $exists: true,
                $eq: 'ProgramMembership'
            },
            // ownedFrom: {
            //     $exists: true,
            //     $gte: moment('2019-12-22T00:00:00+09:00').toDate(),
            //     $lte: moment('2020-01-22T00:00:00+09:00').toDate()
            // },
            ownedThrough: {
                $exists: true,
                $gte: moment('2020-04-22T00:00:00+09:00').toDate()
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

        const membershipFor = ownershipInfo.typeOfGood.membershipFor;
        if (membershipFor === undefined || membershipFor === null) {
            console.log('membershipFor undefined');
            console.log('migrating ownershipInfo...', ownershipInfo.identifier, ownershipInfo.ownedFrom);

            // 移行
            await ownershipInfoRepo.ownershipInfoModel.findOneAndUpdate(
                { _id: ownershipInfo.id },
                { 'typeOfGood.membershipFor': membershipFor4update }
            ).exec();
        } else {
            console.log('membershipFor exists');
        }

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
