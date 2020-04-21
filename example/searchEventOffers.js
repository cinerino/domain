const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const offers = await domain.service.offer.searchEventTicketOffers({
        project: { id: 'sskts-development' },
        event: {
            id: '12116221020200121901710'
        },
        seller: { id: '59d20831e53ebc2b4e774467' }
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
