const domain = require('../../lib');

const cognitoIdentityServiceProvider = new domain.AWS.CognitoIdentityServiceProvider({
    apiVersion: 'latest',
    region: 'ap-northeast-1',
    credentials: new domain.AWS.Credentials({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    })
});

async function main() {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const username = 'test';

    const personRepo = new domain.repository.Person({
        userPoolId: userPoolId
    });

    const people = await personRepo.search({
        username: username,
    });
    console.log(people.length, 'people found');

    // await Promise.all(people.map(async (person) => {
    //     await new Promise((resolve) => {
    //         cognitoIdentityServiceProvider.adminDeleteUser(
    //             {
    //                 UserPoolId: userPoolId,
    //                 Username: person.memberOf.membershipNumber
    //             }, (err, data) => {
    //                 console.log(err, data);
    //                 resolve();
    //             }
    //         );
    //     });
    // }));
    // console.log('people deleted');
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
