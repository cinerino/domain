/**
 * アクション検索サンプル
 */
const mongoose = require('mongoose');
const domain = require('../../');

const roles = require('./roles.json');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const roleRepo = new domain.repository.Role(mongoose.connection);

    console.log('creating roles...', roles);
    await roleRepo.roleModel.create(roles);
    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
