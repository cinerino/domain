const mongoose = require('mongoose');
const domain = require('../');
const { code } = require('../lib/service');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();

    const authorizations = await domain.service.code.publish({
        project: { typeOf: 'Project', id: 'cinerino' },
        agent: { typeOf: 'Person', name: 'sampleName' },
        recipient: { typeOf: 'Person', name: 'sampleName' },
        object: [
            { typeOf: 'OwnershipInfo', id: '0a111b58-47df-47c8-b4de-60dfbabf8cdb' },
            { typeOf: 'OwnershipInfo', id: '0a111b58-47df-47c8-b4de-60dfbabf8cdb' },
            { typeOf: 'OwnershipInfo', id: '0a111b58-47df-47c8-b4de-60dfbabf8cdb' }
        ],
        purpose: {},
        validFrom: now,
        expiresInSeconds: 10
    })({
        action: new domain.repository.Action(mongoose.connection),
        code: new domain.repository.Code(mongoose.connection)
    });
    console.log('published', authorizations);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
