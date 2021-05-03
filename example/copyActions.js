const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const oldActionRepo = new domain.repository.Action(oldConnection);
    const actionRepo = new domain.repository.Action(connection);

    const cursor = await oldActionRepo.actionModel.find(
        {
            // 'project.id': { $exists: true, $eq: 'sskts-production' },
            startDate: {
                $gte: moment('2020-12-01T00:00:00+09:00').toDate(),
                $lt: moment('2021-01-01T00:00:00+09:00').toDate(),
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .sort({ startDate: -1 })
        .cursor();
    console.log('actions found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const action = doc.toObject();
        const actionId = action.id;
        console.log('migrating action...', actionId, action.startDate);

        // アクション移行
        delete action._id;
        delete action.id;
        await actionRepo.actionModel.create(action);

        console.log('added', actionId, action.startDate, i);
    });

    console.log(i, 'actions migrated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
