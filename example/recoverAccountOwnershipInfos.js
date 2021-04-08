const moment = require('moment');
const mongoose = require('mongoose');
const domain = require('../');

const projectId = '';
const pecorinoAuthClient = new domain.pecorinoapi.auth.ClientCredentials({
    domain: domain.credentials.pecorino.authorizeServerDomain,
    clientId: domain.credentials.pecorino.clientId,
    clientSecret: domain.credentials.pecorino.clientSecret,
    scopes: [],
    state: ''
});

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const now = new Date();
    const openThrough = moment(now)
        .add(-18, 'months')
        .toDate();

    const personRepo = new domain.repository.Person({
        userPoolId: ''
    });
    const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);


    // シネサン口座を検索18カ月前以前に開設のもの(Opened)
    const accountService = new domain.pecorinoapi.service.Account({
        endpoint: domain.credentials.pecorino.endpoint,
        auth: pecorinoAuthClient
    });

    const accounts = [];
    let count = 100;
    const limit = 100;
    let page = 0;
    while (count >= limit) {
        page += 1;

        const searchAccountsResult = await accountService.search({
            limit,
            page,
            project: { id: { $eq: projectId } },
            statuses: [domain.pecorinoapi.factory.accountStatusType.Opened],
            // accountNumber: { $eq: '30609200519' }
            openDate: {
                // $gte: moment(openThrough)
                //     .add(-1, 'day')
                //     .toDate(),
                $lte: openThrough
            }
        });
        console.log(accounts.length);
        count = searchAccountsResult.data.length;
        console.log('page / count:', page, count);
        accounts.push(...searchAccountsResult.data);
    }
    console.log(accounts.length, 'accounts found');

    const checkingAcount = accounts.length;
    let checkedCount = 0;
    for (const account of accounts) {
        checkedCount += 1;

        try {
            // 口座に対する所有権検索
            const accountOwnerships = await ownershipInfoRepo.search({
                limit: 1,
                project: { id: { $eq: projectId } },
                typeOfGood: {
                    typeOf: { $eq: 'Account' },
                    accountNumber: { $eq: account.accountNumber }
                }
            });
            if (accountOwnerships.length > 0) {
                console.log('ownershipInfo exists', account.accountNumber, checkedCount, '/', checkingAcount);
            } else {
                // account.nameがユーザーネームなので、ユーザーネームからcognito会員検索
                console.log('searching person...', account.openDate, account.accountNumber, account.name);
                const profile = await personRepo.getUserAttributes({
                    username: account.name
                });
                console.log('profile found');

                // person.idに対して、accountに対する所有権を、口座開設～100年後で作成
                const ownedBy = {
                    typeOf: "Person",
                    id: profile.additionalProperty.find((p) => p.name === 'sub').value,
                    identifier: [
                        {
                            "name": "tokenIssuer",
                            "value": ""
                        },
                        {
                            "name": "iss",
                            "value": ""
                        },
                        {
                            "name": "createdBy",
                            "value": "recover"
                        },
                    ],
                    memberOf: {
                        "award": [],
                        "membershipNumber": account.name,
                        "name": "Default Program Membership",
                        "programName": "Default Program Membership",
                        "typeOf": "ProgramMembership",
                        "url": ""
                    },
                    familyName: profile.familyName,
                    givenName: profile.givenName,
                    name: `${profile.givenName} ${profile.familyName}`
                };

                const ownershipInfo = {
                    identifier: `${ownedBy.id}-Account-${account.accountNumber}`,
                    acquiredFrom: {
                    },
                    ownedBy: ownedBy,
                    ownedFrom: moment(account.openDate)
                        .toDate(),
                    ownedThrough: moment(account.openDate)
                        .add(100, 'years')
                        .toDate(),
                    project: {
                    },
                    typeOf: "OwnershipInfo",
                    typeOfGood: {
                        project: {
                        },
                        identifier: account.accountNumber,
                        issuedThrough: {
                        },
                        typeOf: "Account",
                        validFor: "P100Y",
                        name: account.name,
                        dateIssued: moment(account.openDate)
                            .toDate(),
                        accountNumber: account.accountNumber,
                        accountType: "Point"
                    }
                };
                console.log('creating ownershipInfo...', account.accountNumber, ownershipInfo.identifier);

                await ownershipInfoRepo.saveByIdentifier(ownershipInfo);
            }
        } catch (error) {
            console.error(error);
        }

        console.log('checked', account.accountNumber, checkedCount, '/', checkingAcount);
    }

    // await mongoose.disconnect();
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
