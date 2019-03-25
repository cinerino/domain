const domain = require('../lib');

async function main() {
    const redisClient = await domain.redis.createClient({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_KEY,
        tls: { servername: process.env.REDIS_TLS_SERVERNAME }
    });;

    const params = [...Array(100)].map((_, i) => {
        console.log(i);
        return {
            id: i.toString(),
            remainingAttendeeCapacity: i
        }
    });
    const capacityRepo = new domain.repository.event.AttendeeCapacityRepo(redisClient);
    await capacityRepo.updateByEventIds(params);

    const capacities = await capacityRepo.findByEventIds(['1', '2', '100', '100', 'notfound']);
    console.log('capacities:', capacities);
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
