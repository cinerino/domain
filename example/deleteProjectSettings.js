const domain = require('../lib');
const mongoose = require('mongoose');
const moment = require('moment');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
    const cursor = await ownershipInfoRepo.ownershipInfoModel.find(
        {
            ownedFrom: {
                $gte: moment().add(-1, 'day').toDate(),
                $lte: moment().add(-0, 'months').toDate(),
            }
        },
        {
            _id: 1,
            project: 1
        }
    )
        .cursor();
    console.log('ownershipInfos found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        const ownershipInfo = doc.toObject();

        if (ownershipInfo.project !== undefined && ownershipInfo.project !== null) {
            if (ownershipInfo.project.settings !== undefined) {
                console.log(ownershipInfo.id, 'settings found');
                i += 1;
                await ownershipInfoRepo.ownershipInfoModel.findOneAndUpdate(
                    { _id: ownershipInfo.id },
                    {
                        $unset: {
                            'project.settings': 1
                        }
                    }
                ).exec();
            }
        }
        console.log('deleted', ownershipInfo.id, i);
    });

    console.log(i, 'ownershipInfos project settings deleted');
}

main().then(console.log).catch(console.error);
