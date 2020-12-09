import * as cdigit from 'cdigit';
import * as moment from 'moment-timezone';
import * as redis from 'redis';
import * as util from 'util';

// tslint:disable-next-line:no-require-imports no-var-requires
const fpe = require('node-fpe');

import * as factory from '../factory';

/**
 * 注文番号リポジトリ
 */
export class RedisRepository {
    public static REDIS_KEY_PREFIX: string = 'cinerino:orderNumber';

    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * タイムスタンプから発行する
     */
    public async publishByTimestamp(params: {
        project: { id: string };
        /**
         * 注文日時
         */
        orderDate: Date;
    }): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            // tslint:disable-next-line:no-magic-numbers
            const projectPrefix = params.project.id.slice(0, 3)
                .toUpperCase();
            const timestamp = moment(params.orderDate)
                .valueOf()
                .toString();

            const now = moment();
            const TTL = moment(params.orderDate)
                .add(1, 'minute') // ミリ秒でカウントしていくので、注文日時後1分で十分
                .diff(now, 'seconds');
            const key = util.format(
                '%s:%s:%s',
                RedisRepository.REDIS_KEY_PREFIX,
                projectPrefix,
                timestamp
            );

            this.redisClient.multi()
                .incr(key)
                .expire(key, TTL)
                .exec((err, results) => {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore if: please write tests */
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else: please write tests */
                        if (Number.isInteger(results[0])) {
                            let orderNumber = timestamp;
                            const no: number = results[0];

                            // orderNumber = `${orderNumber}${(`${no}`).slice(-1)}`; // ミリ秒あたり10件以内の注文想定
                            orderNumber = `${orderNumber}${no}`;

                            // checkdigit
                            const cd = cdigit.luhn.compute(orderNumber);

                            const cipher = fpe({ password: cd });
                            orderNumber = cipher.encrypt(orderNumber);

                            orderNumber = `${projectPrefix}${cd}${orderNumber}`;
                            orderNumber = `${[
                                // tslint:disable-next-line:no-magic-numbers
                                orderNumber.slice(0, 4),
                                // tslint:disable-next-line:no-magic-numbers
                                orderNumber.slice(4, 11),
                                // tslint:disable-next-line:no-magic-numbers
                                orderNumber.slice(11)
                            ].join('-')}`;

                            resolve(orderNumber);
                        } else {
                            // 基本的にありえないフロー
                            reject(new factory.errors.ServiceUnavailable('Order number not published'));
                        }
                    }
                });
        });
    }
}
