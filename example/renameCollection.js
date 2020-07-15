const mongoose = require('mongoose');

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    connection.db.renameCollection('organizations', 'sellers');
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
