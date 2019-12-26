/**
 * アクション検索サンプル
 */
const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const actions = await actionRepo.search({
        sort: { startDate: -1 },
        typeOf: domain.factory.actionType.AuthorizeAction,
        startFrom: moment().add(-3, 'days').toDate(),
        startThrough: moment().toDate(),
        object: {
            // typeOf: { $in: ['CreditCard'] }
        },
        // purpose: {
        //     id: { $in: ['5d3d6d3d8205a20019c1b5b0'] }
        // },
        result: {
            // id: { $in: ['5d3d6d3d8205a20019c1b5b0'] }
        }
    });
    console.log(actions.length, 'actions found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
