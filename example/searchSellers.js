/**
 * 販売者検索サンプル
 */
const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const sellerRepo = new domain.repository.Seller(mongoose.connection);
    const sellers = await sellerRepo.search(
        {
            limit: 1
        },
        { 'paymentAccepted.gmoInfo.shopPass': 0 }
    );

    console.log(sellers[0].paymentAccepted);

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
