const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const taskRepo = new domain.repository.Task(connection);

    const cursor = await taskRepo.taskModel.find(
        {
            status: domain.factory.taskStatus.Aborted,
            name: { $eq: 'sendEmailMessage' },
            runsAt: {
                $gte: moment('2020-07-29T15:00:00Z').toDate()
            }
            // orderStatus: { $in: [domain.factory.orderStatus.OrderReturned] }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        // .sort({ runsAt: 1 })
        .cursor();
    console.log('tasks found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const task = doc.toObject();

        await taskRepo.taskModel.findOneAndUpdate(
            { _id: task.id },
            {
                $set: {
                    status: domain.factory.taskStatus.Ready,
                    remainingNumberOfTries: 3
                }
            }
        ).exec();
        console.log('added', task.id, i);
    });

    console.log(i, 'tasks set ready');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
