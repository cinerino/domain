const domain = require('../lib');
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const taskRepo = new domain.repository.Task(mongoose.connection);

    await domain.service.task.executeByName(
        domain.factory.taskName.PlaceOrder
    )({
        taskRepo: taskRepo,
        connection: mongoose.connection
    });

    await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
