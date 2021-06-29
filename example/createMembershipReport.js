const moment = require('moment');
const mongoose = require('mongoose');
const request = require('request-promise-native');
const util = require('util');
const domain = require('../lib');

const project = { typeOf: 'Project', id: '' };

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: domain.credentials.chevre.authorizeServerDomain,
    clientId: domain.credentials.chevre.clientId,
    clientSecret: domain.credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const SUBJECT = 'Membership Report';
const itemType = 'ProgramMembership';
const orderDateFrom = moment('2020-08-31T15:00:00Z').toDate();
const orderDateThrough = moment('2020-09-30T14:59:59Z').toDate();

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();

    const sellerService = new domain.chevre.service.Seller({
        endpoint: domain.credentials.chevre.endpoint,
        auth: chevreAuthClient
    });
    const searchSellersResult = await sellerService.search({ project: { id: { $eq: project.id } } });
    console.log(searchSellersResult.data.length, 'sellers found');

    const sellers = searchSellersResult.data;

    const orderRepo = new domain.repository.Order(mongoose.connection);
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);

    const results = [];
    for (const seller of sellers) {

        const ordersCount = await orderRepo.count({
            project: { id: { $eq: project.id } },
            acceptedOffers: { itemOffered: { typeOf: { $in: [itemType] } } },
            orderDate: {
                $gte: orderDateFrom,
                $lte: orderDateThrough
            },
            seller: { ids: [seller.id] },
            customer: { additionalProperty: { $in: [{ name: 'firstMembership', value: '1' }] } }
        });
        console.log('ordersCount:', ordersCount, 'seller:', seller.name.ja);

        const ownershipInfosCount = await ownershipInfoRepo.ownershipInfoModel.countDocuments({
            'project.id': {
                $eq: project.id
            },
            'typeOfGood.typeOf': {
                $exists: true,
                $eq: itemType
            },
            ownedFrom: { $lte: now },
            ownedThrough: { $gte: now },
            'acquiredFrom.id': {
                $exists: true,
                $eq: seller.id
            }
        });
        console.log('ownershipInfosCount:', ownershipInfosCount, 'seller:', seller.name.ja);

        results.push({
            seller: seller,
            ordersCount,
            ownershipInfosCount,
            now,
            orderDateFrom,
            orderDateThrough
        });
    }


    const header = util.format(
        '| %s | %s | %s | %s | %s |\n| %s | %s | %s | %s | %s |',
        `販売者ID                           `.slice(0, 24),
        `販売者名称                           `.slice(0, 24),
        `注文数                           `.slice(0, 24),
        `所有権数                           `.slice(0, 24),
        `                              `.slice(0, 24),
        `------------------------                                    `.slice(0, 30),
        `------------------------                              `.slice(0, 24),
        `------------------------                              `.slice(0, 24),
        `------------------------                              `.slice(0, 24),
        `------------------------                              `.slice(0, 24),
        `------------------------                              `.slice(0, 24)
    );

    const table = util.format(
        '%s\n%s',
        header,
        results.map((result) => {
            return util.format(
                '| %s | %s | %s | %s | %s |',
                `${result.seller.id}                              `.slice(0, 24),
                `${result.seller.name.ja}                              `.slice(0, 24),
                `${result.ordersCount}                              `.slice(0, 24),
                `${result.ownershipInfosCount}                              `.slice(0, 24),
                `                              `.slice(0, 24)
            );
        }).join('\n')
    );


    const text = `## ${SUBJECT}
### 設定
key  | value
------ | ------
プロジェクト  | ${project.id}
集計日時 | ${moment(now).toISOString()}
注文期間  | ${moment(orderDateFrom).toISOString()} - ${moment(orderDateThrough).toISOString()}

### 集計結果
${table}
        `;

    console.log(text);



    // backlogへ通知
    const users = await request.get(
        {
            url: `https://m-p.backlog.jp/api/v2/projects/CINERINO/users?apiKey=${process.env.BACKLOG_API_KEY}`,
            json: true
        }
    )
        .then((body) => body);

    console.log('notifying', users.length, 'people on backlog...');
    await request.post(
        {
            url: `https://m-p.backlog.jp/api/v2/issues/CINERINO-545/comments?apiKey=${process.env.BACKLOG_API_KEY}`,
            form: {
                content: text,
                notifiedUserId: users.map((user) => user.id)
            }
        }
    )
        .promise();

    console.log('posted to backlog.');
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
