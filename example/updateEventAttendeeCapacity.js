const domain = require('../lib');
const moment = require('moment');

async function main() {
    const redisClient = await domain.redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY,
        tls: { servername: process.env.REDIS_TLS_SERVERNAME }
    });;

    const capacityRepo = new domain.repository.event.AttendeeCapacityRepo(redisClient);

    await domain.service.stock.updateEventAttendeeCapacity({
        locationBranchCode: '118',
        offeredThrough: { identifier: domain.factory.service.webAPI.Identifier.COA },
        importFrom: moment().toDate(),
        importThrough: moment().add(1, 'week').toDate()
    })({
        attendeeCapacity: capacityRepo
    });
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
