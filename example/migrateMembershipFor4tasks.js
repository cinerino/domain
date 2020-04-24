const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const taskRepo = new domain.repository.Task(connection);

    const membershipFor4update = {
        typeOf: 'MembershipService',
        id: '5b1874be4e1537775703963e'
    };

    const cursor = await taskRepo.taskModel.find(
        {
            'project.id': { $exists: true, $eq: '' },
            name: domain.factory.taskName.OrderProgramMembership,
            status: {
                $in: [domain.factory.taskStatus.Ready]
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

        const membershipFor = task.data.object.itemOffered.membershipFor;
        if (membershipFor === undefined || membershipFor === null) {
            console.log('membershipFor undefined');
            console.log('migrating task...', task.id, task.runsAt);

            // 移行
            await taskRepo.taskModel.findOneAndUpdate(
                { _id: task.id },
                { 'data.object.itemOffered.membershipFor': membershipFor4update }
            ).exec();
        } else {
            console.log('membershipFor exists');
        }

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
