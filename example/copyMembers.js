const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI_ADMIN);

    const db = mongoose.connection.db.admin();
    const result = await db.command({ renameCollection: "cinerino.members", to: "chevre.members", dropTarget: true });
    console.log(result);
}

main()
    .then()
    .catch(console.error);

