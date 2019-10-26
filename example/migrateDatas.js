const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    const oldConnection = await mongoose.createConnection(process.env.MONGOLAB_URI_OLD);
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const oldRepo = new domain.repository.Task(oldConnection);
    const repo = new domain.repository.Task(connection);

    const docs = await oldRepo.taskModel.find({ status: 'Ready' }).exec();
    console.log(docs);
    console.log(docs.length);

    await Promise.all(docs.map(async (doc) => {
        try {
            const updated = await repo.taskModel.create(doc);
            console.log(updated);
        } catch (error) {

        }
    }));

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
