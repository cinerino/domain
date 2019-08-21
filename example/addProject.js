const domain = require('../lib');
const mongoose = require('mongoose');

const project = { typeOf: 'Project', id: process.env.PROJECT_ID };

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const taskRepo = new domain.repository.Task(mongoose.connection);
    const cursor = await taskRepo.taskModel.find(
        {
            // _id: '5bd9c9d69d1c011924cceb35',
            name: domain.factory.taskName.RegisterProgramMembership,
            status: domain.factory.taskStatus.Ready
        },
        {
            _id: 1,
            project: 1
        }
    )
        .cursor();
    console.log('tasks found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        const task = doc.toObject();

        if (task.project === undefined || task.project === null) {
            i += 1;
            await taskRepo.taskModel.findOneAndUpdate(
                { _id: task.id },
                {
                    project: project,
                    'data.project': project,
                    'data.object.itemOffered.project': project
                }
            ).exec();
        }
        console.log('added', task.id, i);
    });

    console.log(i, 'tasks project added');
}

main().then(console.log).catch(console.error);
