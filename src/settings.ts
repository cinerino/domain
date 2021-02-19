import * as factory from './factory';

const informOrderUrls = (typeof process.env.INFORM_ORDER_URL === 'string')
    ? process.env.INFORM_ORDER_URL.split(',')
    : [];

/**
 * グローバル設定
 */
export const settings: factory.project.ISettings = {
    onOrderStatusChanged: {
        informOrder: informOrderUrls
            .filter((url) => url.length > 0)
            .map((url) => {
                return {
                    recipient: {
                        typeOf: factory.chevre.creativeWorkType.WebApplication,
                        name: 'Global HUB',
                        url
                    }
                };
            })
    }
};
