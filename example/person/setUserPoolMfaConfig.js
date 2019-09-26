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

    const personRepo = new domain.repository.Person({
        userPoolId: userPoolId
    });

    cognitoIdentityServiceProvider.setUserPoolMfaConfig({
        "MfaConfiguration": "OFF",
        // "MfaConfiguration": "OPTIONAL",
        // "SmsMfaConfiguration": {
        //     "SmsAuthenticationMessage": "string",
        //     "SmsConfiguration": {
        //         "ExternalId": "f25aae2e-a56a-4b3d-b066-b022ce472b16",
        //         "SnsCallerArn": "arn:aws:iam::253260029663:role/service-role/ssktsdevelopmentv2-SMS-Role"
        //     }
        // },
        // "SoftwareTokenMfaConfiguration": { 
        //    "Enabled": boolean
        // },
        "UserPoolId": userPoolId
    }, (err, data) => {
        console.log(err, data);
    });

    cognitoIdentityServiceProvider.getUserPoolMfaConfig({
        "UserPoolId": userPoolId
    }, (err, data) => {
        console.log(err, data);
    });
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
