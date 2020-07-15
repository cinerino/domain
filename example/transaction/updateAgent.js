const domain = require('../../lib');
const moment = require('moment');
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const transactionRepo = new domain.repository.Transaction(mongoose.connection);

    const sellers = await selllerRepo.search({});
    console.log(sellers.length, 'sellers found');
    const seller = sellers[0];

    const customer = {
        typeOf: domain.factory.personType.Person,
        id: 'customerId',
    }

    const transaction = await domain.service.transaction.placeOrderInProgress.start({
        project: { id: 'cinerino' },
        expires: moment()
            .add(5, 'minutes')
            .toDate(),
        agent: customer,
        seller: {
            typeOf: seller.typeOf,
            id: seller.id
        },
        object: {}
    })({
        transaction: transactionRepo
    });
    console.log('transaction started', transaction.id);

    await domain.service.transaction.placeOrderInProgress.updateAgent({
        id: transaction.id,
        agent: {
            id: customer.id,
            givenName: 'Taro',
            familyName: 'Motion',
            telephone: '+819012345678s',
            email: 'hello@motionpicture.jp',
            name: 'Taro Motion',
            url: 'http://example.com',
            additionalProperty: [
                { name: 'name1', value: 'value1' },
                { name: 'name2', value: 'value2' }
            ]
        }
    })({
        transaction: transactionRepo
    });
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
