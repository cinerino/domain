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
        clientSecret: <string>process.env.CHEVRE_CLIENT_SECRET
    },
    mvtkReserve: {
        authorizeServerDomain: <string>process.env.MVTK_RESERVE_AUTHORIZE_SERVER_DOMAIN,
        clientId: <string>process.env.MVTK_RESERVE_CLIENT_ID,
        clientSecret: <string>process.env.MVTK_RESERVE_CLIENT_SECRET
    },
    pecorino: {
        authorizeServerDomain: <string>process.env.PECORINO_AUTHORIZE_SERVER_DOMAIN,
        clientId: <string>process.env.PECORINO_CLIENT_ID,
        clientSecret: <string>process.env.PECORINO_CLIENT_SECRET
    }
};
