const moment = require('moment');
const mongoose = require('mongoose');
const redis = require('redis');
const domain = require('../lib');

const project = { typeOf: 'Project', id: 'cinerino' };

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);
    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY
    });

    try {
        await domain.service.task.executeByName({
            // project: project,
            name: domain.factory.taskName.OrderProgramMembership
        })({
            connection: mongoose.connection,
            redisClient: redisClient
        });
    } catch (error) {
        // tslint:disable-next-line:no-console
        console.error(error);
    }
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
