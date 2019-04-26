const domain = require('../lib');
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const project = {
        typeOf: 'Project',
        id: 'cinerino'
    };

    const sellerRepo = new domain.repository.Seller(mongoose.connection);
    const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
    const eventRepo = new domain.repository.Event(mongoose.connection);
    const paymentMethodRepo = new domain.repository.PaymentMethod(mongoose.connection);
    const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
    const orderRepo = new domain.repository.Order(mongoose.connection);
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(mongoose.connection);
    const taskRepo = new domain.repository.Task(mongoose.connection);
    const actionRepo = new domain.repository.Action(mongoose.connection);

    let result = await sellerRepo.organizationModel.updateMany({}, { project: project }).exec();
    console.log(result);
    // result = await programMembershipRepo.programMembershipModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await eventRepo.eventModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await paymentMethodRepo.paymentMethodModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await invoiceRepo.invoiceModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await orderRepo.orderModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await ownershipInfoRepo.ownershipInfoModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await transactionRepo.transactionModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await actionRepo.actionModel.updateMany({}, { project: project }).exec();
    // console.log(result);
    // result = await taskRepo.taskModel.updateMany({}, { project: project }).exec();
    // console.log(result);
}

main().then(console.log).catch(console.error);
