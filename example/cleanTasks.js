const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();
    const startThrough = moment(now)
        .add(-8, 'months')
        .toDate();

    console.log('deleting...startThrough:', startThrough);

    const taskRepo = new domain.repository.Task(mongoose.connection);

    let result;

    result = await taskRepo.taskModel.deleteMany({
        status: { $in: [domain.factory.taskStatus.Aborted, domain.factory.taskStatus.Executed] },
        runsAt: { $lt: startThrough }
    })
        .exec();
    console.log('tasks deleted', result);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
