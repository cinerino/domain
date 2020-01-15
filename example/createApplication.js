const mongoose = require('mongoose');
const domain = require('../');

async function main() {
    await mongoose.connect(process.env.MONGOLAB_URI);

    const projectId = 'cinerino';

    const cognitoIdentityServiceProvider = new domain.AWS.CognitoIdentityServiceProvider({
        apiVersion: 'latest',
        region: 'ap-northeast-1',
        credentials: new domain.AWS.Credentials({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        })
    });

    const userPoolId = '';
    const name = '';

    // 全スコープを取得
    const resourceServer = await new Promise((resolve, reject) => {
        cognitoIdentityServiceProvider.describeResourceServer(
            {
                UserPoolId: userPoolId,
                Identifier: 'https://api-dot-cinerino.appspot.com',
            },
            (err, data) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    if (data.ResourceServer === undefined) {
                        reject(new cinerino.factory.errors.NotFound('ResourceServer'));
                    } else {
                        resolve(data.ResourceServer);
                    }
                }
            }
        );
    });

    const allowedOAuthScopes = resourceServer.Scopes.map((scope) => `${resourceServer.Identifier}/${scope.ScopeName}`);

    let callbackURLs;
    let logoutURLs;
    const allowedOAuthFlow = 'client_credentials';
    // const allowedOAuthFlow = 'code';
    if (allowedOAuthFlow === 'code') {
        callbackURLs = ['https://localhost/signIn'];
        logoutURLs = ['https://localhost/signOut'];
        allowedOAuthScopes.push(...['phone', 'email', 'openid', 'aws.cognito.signin.user.admin', 'profile']);
    }

    // Cognitoでアプリケーションクライアント作成
    const userPoolClient = await new Promise((resolve, reject) => {
        cognitoIdentityServiceProvider.createUserPoolClient(
            {
                UserPoolId: userPoolId,
                ClientName: name,
                GenerateSecret: true,
                // RefreshTokenValidity?: RefreshTokenValidityType;
                // ReadAttributes?: ClientPermissionListType;
                // WriteAttributes?: ClientPermissionListType;
                // ExplicitAuthFlows?: ExplicitAuthFlowsListType;
                SupportedIdentityProviders: ['COGNITO'],
                CallbackURLs: callbackURLs,
                LogoutURLs: logoutURLs,
                // DefaultRedirectURI?: RedirectUrlType;
                // AllowedOAuthFlows: ['client_credentials'],
                AllowedOAuthFlows: [allowedOAuthFlow],
                AllowedOAuthScopes: allowedOAuthScopes,
                AllowedOAuthFlowsUserPoolClient: true
                // PreventUserExistenceErrors?: PreventUserExistenceErrorTypes;
            },
            (err, data) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    if (data.UserPoolClient === undefined) {
                        reject(new cinerino.factory.errors.NotFound('UserPool'));
                    } else {
                        resolve(data.UserPoolClient);
                    }
                }
            }
        );
    });
    console.log('created', userPoolClient);

    const applicationRepo = new domain.repository.Application(mongoose.connection);
    const doc = await applicationRepo.applicationModel.create({
        _id: userPoolClient.ClientId,
        typeOf: domain.factory.creativeWorkType.WebApplication,
        project: { typeOf: domain.factory.organizationType.Project, id: projectId },
        name: userPoolClient.ClientName
    });
    console.log('created', doc.toObject());
}

main().then(() => {
    console.log('success!');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
