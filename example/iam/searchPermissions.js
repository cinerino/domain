const mongoose = require('mongoose');
const domain = require('../../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const memberRepo = new domain.repository.Member(mongoose.connection);
    const roleRepo = new domain.repository.Role(mongoose.connection);
    const permissions = await domain.service.iam.searchPermissions({
        project: { id: 'cinerino' },
        member: { id: 'memberId' }
    })({
        member: memberRepo,
        role: roleRepo
    });
    console.log(permissions);
    console.log(permissions.length, 'permissions found.');

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
