const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const applicationRepo = new domain.repository.Application(mongoose.connection);
    const applications = await applicationRepo.search({
        id: { $eq: '12345' }
    });
    console.log(applications.length, 'applications found');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
