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
    const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);

    const username = '';

    let profile = await personRepo.getUserAttributes({
        userPooId: process.env.COGNITO_USER_POOL_ID,
        username: username
    });
    console.log('profile:', profile);

    await personRepo.updateProfile({
        userPooId: process.env.COGNITO_USER_POOL_ID,
        username: username,
        profile: {
            familyName: 'テスト',
            givenName: profile.givenName,
            telephone: profile.telephone,
            email: profile.email,
            additionalProperty: [{
                name: 'custom:postalCode',
                value: '999-9999'
            }]
        }
    });

    profile = await personRepo.getUserAttributes({
        userPooId: process.env.COGNITO_USER_POOL_ID,
        username: username
    });
    console.log('profile:', profile);

}

main().then(() => {
    console.log('success!');
}).catch(console.error);
