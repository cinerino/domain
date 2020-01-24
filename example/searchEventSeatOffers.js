/**
 * アクション検索サンプル
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const offers = await domain.service.offer.searchEventOffers({
        project: { id: 'sskts-development' },
        event: {
            id: '12116221020200121901710'
        }
    })({
        event: new domain.repository.Event(mongoose.connection),
        project: new domain.repository.Project(mongoose.connection),
    });

    console.log(offers);
    console.log(offers[0].containsPlace);
    console.log(offers[0].containsPlace.map((seat => `${seat.branchCode} ${seat.offers[0].availability} ${seat.additionalProperty.map((p) => `${p.name}:${p.value}`).join(',')}`)));
    console.log(offers.length, 'offers found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
