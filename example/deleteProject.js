const domain = require('../lib');
const mongoose = require('mongoose');

const project = {
    typeOf: 'Project',
    id: 'xxx'
};

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    console.log('deleting...', project.id);
    await domain.service.project.deleteProject({ id: project.id })({
        action: new domain.repository.Action(mongoose.connection),
        code: new domain.repository.Code(mongoose.connection),
        invoice: new domain.repository.Invoice(mongoose.connection),
        member: new domain.repository.Member(mongoose.connection),
        order: new domain.repository.Order(mongoose.connection),
        ownershipInfo: new domain.repository.OwnershipInfo(mongoose.connection),
        paymentMethod: new domain.repository.PaymentMethod(mongoose.connection),
        project: new domain.repository.Project(mongoose.connection),
        task: new domain.repository.Task(mongoose.connection),
        transaction: new domain.repository.Transaction(mongoose.connection),
    });
    console.log('deleted', project.id);
}

main().then(console.log).catch(console.error);
