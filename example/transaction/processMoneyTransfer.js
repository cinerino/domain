const moment = require('moment');
const mongoose = require('mongoose');

const domain = require('../../lib');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);

    const accountService = new domain.pecorinoapi.service.Account({
        endpoint: process.env.PECORINO_ENDPOINT,
        auth: new domain.pecorinoapi.auth.ClientCredentials({
            domain: process.env.PECORINO_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.PECORINO_CLIENT_ID,
            clientSecret: process.env.PECORINO_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    })

    const transferTransactionService = new domain.pecorinoapi.service.transaction.Transfer({
        endpoint: process.env.PECORINO_ENDPOINT,
        auth: new domain.pecorinoapi.auth.ClientCredentials({
            domain: process.env.PECORINO_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.PECORINO_CLIENT_ID,
            clientSecret: process.env.PECORINO_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });

    const transaction = await domain.service.transaction.moneyTransfer.start({
        expires: moment().add(5, 'minutes').toDate(),
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
            amount: 10,
            toLocation: { accountType: domain.factory.accountType.Point, accountNumber: '50031310908' }
        }
    })({
        accountService: accountService,
        transaction: transactionRepo
    });
    console.log('transaction started', transaction);

    const authorizeAccountPaymentAction = await domain.service.payment.account.startTransaction({
        object: {
            typeOf: domain.factory.paymentMethodType.Account,
            amount: transaction.object.amount,
            fromAccount: { accountType: domain.factory.accountType.Point, accountNumber: '60101119300' },
            toAccount: { accountType: domain.factory.accountType.Point, accountNumber: '50031310908' },
            notes: 'test from samples',
            currency: domain.factory.accountType.Point
        },
        agent: transaction.agent,
        purpose: transaction
    })({
        action: actionRepo,
        transaction: transactionRepo,
        transferTransactionService: transferTransactionService
    });
    console.log('account authorized', authorizeAccountPaymentAction);

    try {
        await domain.service.transaction.moneyTransfer.confirm(transaction)({
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
