const moment = require('moment');
const mongoose = require('mongoose');

const domain = require('../../lib');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);

    const transaction = await domain.service.transaction.moneyTransfer.start({
        project: { typeOf: domain.factory.chevre.organizationType.Project, id: 'cinerino' },
        expires: moment()
            .add(1, 'minutes')
            .toDate(),
        agent: {
            typeOf: domain.factory.personType.Person,
            id: 'personId',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
        },
        recipient: {
            typeOf: domain.factory.personType.Person,
            id: 'recipientId'
        },
        object: {
            clientUser: {},
            amount: { value: 10, currency: 'JPY' },
            fromLocation: { typeOf: 'PrepaidPaymentCard', identifier: '139485855034733' },
            toLocation: { typeOf: 'PrepaidPaymentCard', identifier: '430458588634915' },
            description: 'サンプル転送取引'
        },
        seller: { typeOf: 'Corporation', id: '59d20831e53ebc2b4e774466' },
    })({
        action: actionRepo,
        transaction: transactionRepo
    });
    console.log('transaction started', transaction);

    await domain.service.transaction.updateAgent({
        typeOf: transaction.typeOf,
        id: transaction.id,
        agent: { id: transaction.agent.id, name: `セイ　メイ`, email: 'hello@motionpicture.jp', telephone: '+819012345678' }
    })({
        transaction: transactionRepo
    });
    console.log('profile set');

    try {
        await domain.service.transaction.moneyTransfer.confirm({ id: transaction.id })({
            action: actionRepo,
            transaction: transactionRepo
        });
        console.log('transaction confirmed');
    } catch (error) {
        console.error(error);
        await transactionRepo.cancel(transaction);
        console.log('transaction canceled');
    }

    await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
