/**
 * Eメールメッセージビルダー
 */
const pug = require('pug');

const templateDirectory = `${__dirname}/../emails`;

/**
 * 注文配送メッセージを作成する
 */
async function main(params) {
    return new Promise((resolve, reject) => {
        pug.renderFile(
            `${templateDirectory}/sendOrder/text.pug`,
            {
                order: {
                    orderNumber: 'ABC123-12345',
                    confirmationNumber: '12345',
                    price: 12345,
                    customer: {},
                    seller: {}
                },
                eventStartDate: 'eventStartDate',
                workPerformedName: 'name',
                screenName: 'screenName',
                reservedSeats: 'reservedSeats'
            },
            (renderMessageErr, message) => {
                if (renderMessageErr instanceof Error) {
                    reject(renderMessageErr);

                    return;
                }
                console.log(message);
                resolve(message);
            }
        );

    });
}

main().then(() => {
    console.log('success!');
});
