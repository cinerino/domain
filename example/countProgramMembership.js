const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);

    const now = moment().toDate();
    const docs = await ownershipInfoRepo.ownershipInfoModel.count({
        'project.id': {
            $exists: true,
            $eq: 'sskts-production'
        },
        'typeOfGood.typeOf': {
            $exists: true,
            $eq: 'ProgramMembership'
        },
        ownedFrom: { $lte: now },
        ownedThrough: { $gte: now }
    })
        // .limit(100)
        .exec();

    console.log(docs);
    // readable.on('data', function (data) {
    //     console.log(data);
    // });
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
