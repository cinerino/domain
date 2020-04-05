const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const actionRepo = new domain.repository.Action(mongoose.connection);
    const orderRepo = new domain.repository.Order(mongoose.connection);
    const taskRepo = new domain.repository.Task(mongoose.connection);

    await domain.service.task.executeByName({
        project: { id: 'cinerino' },
        name: 'createOrderReport'
    })({ connection: mongoose.connection });

    return;

    await domain.service.report.order.createReport({
        typeOf: 'CreateAction',
        project: { id: 'cinerino' },
        agent: { name: 'sampleCode' },
        // recipient: { name: 'recipientName' },
        object: {
            typeOf: 'Report',
            about: `OrderReport${moment().unix()}`,
            mentions: {
                typeOf: 'SearchAction',
                query: {
                    orderDateFrom: moment().add(-1, 'week').toDate(),
                    orderDateThrough: moment().toDate(),
                },
                object: {
                    typeOf: 'Order'
                }
            },
            // format: domain.factory.encodingFormat.Application.json
            encodingFormat: domain.factory.encodingFormat.Text.csv,
            expires: moment().add(1, 'hour').toDate()
        },
        potentialActions: {
            sendEmailMessage: [
                {
                    object: {
                        about: 'レポートが使用可能です',
                        sender: {
                            name: 'Cinerino Report',
                            email: 'noreply@example.com'
                        },
                        toRecipient: { email: 'ilovegadd@gmail.com' }
                    }
                }
            ]
        }
    })({
        action: actionRepo,
        order: orderRepo,
        task: taskRepo
    });

    // readable.on('data', function (data) {
    //     console.log(data);
    // });
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
