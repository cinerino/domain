const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const projectRepo = new domain.repository.Project(mongoose.connection);
    const memberRepo = new domain.repository.Member(mongoose.connection);

    const projectId = 'sskts-test';
    const username = 'Google_108017370984644649288';
    const roleName = 'owner';
    // const roleName = 'user';

    const roles = [
        {
            typeOf: 'OrganizationRole',
            roleName: roleName,
            memberOf: { typeOf: domain.factory.organizationType.Project, id: projectId },
        }
    ];

    const project = await projectRepo.findById({ id: projectId });
    const adminUserPoolId = project.settings.cognito.adminUserPool.id;

    const personRepo = new domain.repository.Person({
        userPoolId: adminUserPoolId
    });
    const people = await personRepo.search({ username: username });

    if (people.length > 0) {
        const member = people[0];
        console.log('member found', member.id, member.familyName);

        const doc = await memberRepo.memberModel.create({
            project: { typeOf: domain.factory.organizationType.Project, id: projectId },
            typeOf: 'OrganizationRole',
            member: {
                typeOf: member.typeOf,
                id: member.id,
                username: username,
                hasRole: roles
            }
        });
        console.log('member created', doc);
    }
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
