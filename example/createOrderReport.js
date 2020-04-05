const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../lib');

const project = { typeOf: 'Project', id: 'cinerino' };

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const attributes = {
        name: 'createOrderReport',
        status: domain.factory.taskStatus.Ready,
        runsAt: moment()
            .toDate(),
        remainingNumberOfTries: 1,
        numberOfTried: 0,
        executionResults: [],
        data: {
            typeOf: 'CreateAction',
            project: project,
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
        },
        project: project
    };

    const taskRepo = new domain.repository.Task(mongoose.connection);
    const task = await taskRepo.save(attributes);
    console.log('task created', task.id);
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
