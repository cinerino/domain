const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const applicationRepo = new domain.repository.Application(mongoose.connection);
    const memberRepo = new domain.repository.Member(mongoose.connection);

    const docs = await applicationRepo.applicationModel.find().exec();
    console.log(docs.length, 'applications found');

    let numCreated = 0;
    await Promise.all(docs.map(async (doc) => {
        const application = doc.toObject();
        const member = {
            project: { typeOf: application.project.typeOf, id: application.project.id },
            typeOf: 'OrganizationRole',
            member: {
                typeOf: domain.factory.creativeWorkType.WebApplication,
                id: application.id,
                name: application.name,
                hasRole: [{
                    typeOf: 'OrganizationRole',
                    roleName: 'customer',
                    memberOf: { typeOf: application.project.typeOf, id: application.project.id }
                }]
            }
        };
        console.log(member);

        try {
            const doc = await memberRepo.memberModel.findOneAndUpdate(
                {
                    'project.id': member.project.id,
                    'member.id': member.member.id
                },
                member,
                { new: true, upsert: true }
            ).exec();
            console.log('created', doc);
            numCreated += 1;

        } catch (error) {
            console.error(error);
        }

        console.log('created.', numCreated);
    }))
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
