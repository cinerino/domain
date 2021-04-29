
const chevre = require('../lib/index');
const mongoose = require('mongoose');
const moment = require('moment');

const project = { id: '' };

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const actionRepo = new chevre.repository.Action(mongoose.connection);

    const result = await actionRepo.actionModel.updateMany(
        {
            typeOf: 'PayAction',
            // typeOf: 'RefundAction',
            // typeOf: 'RegisterAction',
            // typeOf: 'MoneyTransfer',
            // typeOf: 'CancelAction',
            startDate: {
                $gte: moment('2020-10-01T00:00:00Z')
                    .toDate(),
                $lte: new Date()
            }
        },
        {
            typeOf: 'ConfirmAction'
            // typeOf: 'ReturnAction'
            // typeOf: 'ConfirmAction'
            // typeOf: 'ConfirmAction'
            // typeOf: 'ReturnAction'
        }
    )
        .exec();

    console.log(result);
}

main()
    .then()
    .catch(console.error);
