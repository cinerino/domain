const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

const chevreAuthClient = new domain.chevre.auth.ClientCredentials({
    domain: domain.credentials.chevre.authorizeServerDomain,
    clientId: domain.credentials.chevre.clientId,
    clientSecret: domain.credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const authorizationService = new domain.chevre.service.Authorization({
    endpoint: domain.credentials.chevre.endpoint,
    auth: chevreAuthClient
});

async function main() {
    const connection = await mongoose.createConnection(process.env.MONGOLAB_URI);

    const codeRepo = new domain.repository.Code(connection);

    const cursor = await codeRepo.authorizationModel.find(
        {
            // 'project.id': { $eq: '' },
            validFrom: {
                $gte: moment('2021-01-01T00:00:00+09:00').toDate(),
            }
        },
        { createdAt: 0, updatedAt: 0 }
    )
        // 最近のデータから移行する
        .sort({ validFrom: -1 })
        .cursor();
    console.log('authorizations found');

    let i = 0;
    let updateCount = 0;
    await cursor.eachAsync(async (doc) => {
        i += 1;
        const authorization = doc.toObject();
        console.log('migrating authorization...', authorization.project.id, authorization.code, authorization.validFrom);

        // 注文移行(ステータス変更されるので要調整)
        delete authorization._id;
        delete authorization.id;
        const searchAuthorizationsResult = await authorizationService.search({
            limit: 1,
            code: { $in: [authorization.code] },
            project: { id: { $eq: authorization.project.id } }
        });
        if (searchAuthorizationsResult.data.length > 0) {
            console.log('already migrated', authorization.project.id, authorization.code, authorization.validFrom, i);
        } else {
            updateCount += 1;
            const expiresInSeconds = moment(authorization.validUntil).diff(moment(authorization.validFrom), 'seconds');
            const newAuthorization = {
                ...authorization,
                expiresInSeconds
            };
            console.log('creating...', newAuthorization.project.id, newAuthorization.code, newAuthorization.validFrom, expiresInSeconds, i);
            await authorizationService.create([newAuthorization]);
            console.log('created', authorization.project.id, authorization.code, authorization.validFrom, i);
        }
    });

    console.log(i, 'authorizations migrated', updateCount, 'authorizations created');
    // await mongoose.disconnect();
}

main()
    .then(() => {
        console.log('success!');
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
