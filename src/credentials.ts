/**
 * 外部サービスを使用するための認証情報
 */
export const credentials = {
    aws: {
        accessKeyId: <string>process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: <string>process.env.AWS_SECRET_ACCESS_KEY
    },
    chevre: {
        authorizeServerDomain: <string>process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
        clientId: <string>process.env.CHEVRE_CLIENT_ID,
        clientSecret: <string>process.env.CHEVRE_CLIENT_SECRET,
        endpoint: <string>process.env.CHEVRE_ENDPOINT
    },
    coa: {
        endpoint: <string>process.env.COA_ENDPOINT,
        refreshToken: <string>process.env.COA_REFRESH_TOKEN
    },
    lineNotify: {
        url: <string>process.env.LINE_NOTIFY_URL,
        accessToken: <string>process.env.LINE_NOTIFY_ACCESS_TOKEN
    },
    pecorino: {
        authorizeServerDomain: <string>process.env.PECORINO_AUTHORIZE_SERVER_DOMAIN,
        clientId: <string>process.env.PECORINO_CLIENT_ID,
        clientSecret: <string>process.env.PECORINO_CLIENT_SECRET,
        endpoint: <string>process.env.PECORINO_ENDPOINT
    },
    sendGrid: {
        apiKey: process.env.SENDGRID_API_KEY
    },
    hub: {
        clientId: <string>process.env.HUB_CLIENT_ID
    },
    jwt: {
        secret: <string>process.env.TOKEN_SECRET,
        issuer: <string>process.env.RESOURCE_SERVER_IDENTIFIER
    }
};
