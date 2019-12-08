const mongoose = require('mongoose');
const domain = require('../');
const fs = require('fs');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const applications = JSON.parse(fs.readFileSync(`${__dirname}/applications-development.json`, 'utf8'));
    console.log(applications.length);

    const applicationRepo = new domain.repository.Application(mongoose.connection);
    await Promise.all(applications.map(async (application) => {
        const replacement = { ...application };
        delete replacement.id;
        const result = await applicationRepo.applicationModel.findOneAndUpdate(
            { _id: application.id },
            replacement,
            { upsert: true }
        )
            .exec();
        console.log(result);
    }));

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
