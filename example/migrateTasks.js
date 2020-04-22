const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const oldTaskRepo = new domain.repository.Task(oldConnection);
    const taskRepo = new domain.repository.Task(connection);

    const cursor = await oldTaskRepo.taskModel.find(
        {
            'project.id': { $exists: true, $eq: 'sskts-production' },
            // runsAt: {
            //     $exists: true,
            //     $gte: moment('2020-04-22T00:00:00+09:00').toDate(),
            //     $lte: moment('2020-04-22T00:00:00+09:00').toDate()
            // },
            status: {
                $in: [domain.factory.taskStatus.Ready, domain.factory.taskStatus.Running]
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        .sort({ runsAt: 1 })
        .cursor();
    console.log('tasks found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const task = doc.toObject();
        console.log('migrating task...', task.id, task.runsAt);

        delete task._id;
        delete task.id;
        await taskRepo.taskModel.create(task);

        console.log('added', task.id, i);
    });

    console.log(i, 'tasks migrated');
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
