const domain = require('../../lib');

async function main() {
    const personRepo = new domain.repository.Person({
        userPoolId: process.env.COGNITO_USER_POOL_ID,
    });

    const username = '';

    let profile = await personRepo.getUserAttributes({
        username: username
    });
    console.log('profile:', profile);

    await personRepo.updateProfile({
        username: username,
        profile: {
            familyName: 'テスト',
            givenName: profile.givenName,
            telephone: profile.telephone,
            email: profile.email,
            additionalProperty: [{
                // name: 'email_verified',
                // value: 'true'
                // name: 'custom:postalCode',
                // value: '999-9999'
            }]
        }
    });

    profile = await personRepo.getUserAttributes({
        username: username
    });
    console.log('profile:', profile);

}

main().then(() => {
    console.log('success!');
}).catch(console.error);
