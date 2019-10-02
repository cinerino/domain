
const domain = require('../lib/index');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const orderRepo = new domain.repository.Order(mongoose.connection);

    const cursor = await orderRepo.orderModel.find(
        {
            // orderNumber: "CIN2-8150985-6584258",
            orderDate: {
                $gte: moment()
                    .add(-12, 'months')
                    .toDate(),
            }
        },
        {
            orderNumber: 1,
            acceptedOffers: 1,
        }
    ).sort({ orderDate: -1, })
        .cursor();
    console.log('orders found');

    let i = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const order = doc.toObject();

        const update = {};
        order.acceptedOffers.forEach((o, index) => {
            const reservationFor = o.itemOffered.reservationFor;

            // if (index > 0) {
            //     return;
            // }

            if (reservationFor !== undefined && reservationFor !== null) {
                if (typeof reservationFor.doorTime === 'string') {
                    update[`acceptedOffers.${index}.itemOffered.reservationFor.doorTime`] = moment(reservationFor.doorTime)
                        .toDate();
                }
                if (typeof reservationFor.startDate === 'string') {
                    update[`acceptedOffers.${index}.itemOffered.reservationFor.startDate`] = moment(reservationFor.startDate)
                        .toDate();
                }
                if (typeof reservationFor.endDate === 'string') {
                    update[`acceptedOffers.${index}.itemOffered.reservationFor.endDate`] = moment(reservationFor.endDate)
                        .toDate();
                }
            }
        });

        if (Object.keys(update).length > 0) {
            console.log('update:', update);
            await orderRepo.orderModel.findOneAndUpdate(
                { orderNumber: order.orderNumber },
                update
            ).exec();
            console.log('updated', order.orderNumber, i);
        } else {
            console.log('no update', order.orderNumber);
        }
    });

    console.log(i, 'orders updated');
}

main()
    .then()
    .catch(console.error);
