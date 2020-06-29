const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const offers = await domain.service.offer.product.search({
        project: { id: 'cinerino' },
        itemOffered: {
            id: '5e563a661b58b50007f96f66'
        },
        seller: { id: 'xxx' },
        // availableAt: { id: 'xxx' }
    })({
        project: new domain.repository.Project(mongoose.connection),
    });

    console.log(offers);
    console.log(offers.length, 'offers found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
