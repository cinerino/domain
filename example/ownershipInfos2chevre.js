const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: domain.credentials.chevre.authorizeServerDomain,
    clientId: domain.credentials.chevre.clientId,
    clientSecret: domain.credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const ownershipInfoService = new domain.chevre.service.OwnershipInfo({
    endpoint: domain.credentials.chevre.endpoint,
    auth: chevreAuthClient
});

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(connection);

    const cursor = await ownershipInfoRepo.ownershipInfoModel.find(
        {
            'project.id': { $eq: '' },
            'ownedBy.memberOf.membershipNumber': { $exists: true },
            'typeOfGood.typeOf': { $exists: true, $eq: 'EventReservation' },
            ownedFrom: {
                $lte: moment('2021-03-16T00:00:00+09:00').toDate(),
                $gte: moment('2020-04-29T00:00:00+09:00').toDate(),
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        // 最近のデータから移行する
        .sort({ ownedFrom: -1 })
        .cursor();
    console.log('ownershipInfos found');

    let i = 0;
    let updateCount = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const ownershipInfo = doc.toObject();
        console.log('migrating ownershipInfo...', ownershipInfo.project.id, ownershipInfo.identifier, ownershipInfo.ownedFrom);

        // 注文移行(ステータス変更されるので要調整)
        delete ownershipInfo._id;
        delete ownershipInfo.id;

        updateCount += 1;
        console.log('creating...', ownershipInfo.project.id, ownershipInfo.identifier, ownershipInfo.ownedFrom, i);
        await ownershipInfoService.saveByIdentifier(ownershipInfo);
        console.log('created', ownershipInfo.project.id, ownershipInfo.identifier, ownershipInfo.ownedFrom, i);
    });

    console.log(i, 'ownershipInfos migrated', updateCount, 'ownershipInfos created');
    // await mongoose.disconnect();
}

main()
    .then(() => {
        console.log('success!');
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
