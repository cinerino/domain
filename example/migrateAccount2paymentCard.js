
const chevre = require('../lib/index');
const mongoose = require('mongoose');

const project = { id: '' };

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const ownershipInfoRepo = new chevre.repository.OwnershipInfo(mongoose.connection);

    const cursor = await ownershipInfoRepo.ownershipInfoModel.find(
        {
            'project.id': {
                $exists: true,
                $eq: project.id
            },
            'typeOfGood.typeOf': {
                $exists: true,
                $eq: 'Account'
            }
        },
        {
        }
    )
        // .sort({ modifiedTime: 1, })
        .cursor();
    console.log('ownershipInfos found');

    let i = 0;
    let updateCount = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const ownershipInfo = doc.toObject();

        if (ownershipInfo.typeOfGood.issuedThrough !== undefined
            && ownershipInfo.typeOfGood.issuedThrough !== null
            && ownershipInfo.typeOfGood.issuedThrough.typeOf === 'Account') {
            console.log('updating...', ownershipInfo.id);
            updateCount += 1;
            await ownershipInfoRepo.ownershipInfoModel.findOneAndUpdate(
                {
                    _id: ownershipInfo.id
                },
                {
                    'typeOfGood.issuedThrough.typeOf': 'PaymentCard'
                }
            )
                .exec();
            console.log('updated', ownershipInfo.id, i);
        }
    });

    console.log(i, 'ownershipInfos checked');
    console.log(updateCount, 'ownershipInfos updated');
}

main()
    .then()
    .catch(console.error);
