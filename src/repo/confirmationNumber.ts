import * as createDebug from 'debug';
import * as moment from 'moment-timezone';
import * as redis from 'redis';
import * as util from 'util';

import * as factory from '../factory';

const debug = createDebug('cinerino-domain:repository');

/**
 * 注文確認番号リポジトリ
 */
export class RedisRepository {
    public static REDIS_KEY_PREFIX: string = 'cinerino:confirmationNumber';

    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * 発行する
     */
    public async publish(params: {
        orderDate: Date;
    }): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            // データ保管期間はとりあえず一か月
            const TTL = moment(params.orderDate)
                .add(1, 'month')
                .diff(moment(params.orderDate), 'seconds');
            debug(`TTL:${TTL} seconds`);

            const key = util.format(
                '%s:%s',
                RedisRepository.REDIS_KEY_PREFIX,
                moment(params.orderDate)
                    .tz('Asia/Tokyo')
                    .format('YYMM')
            );

            this.redisClient.multi()
                .incr(key, debug)
                .expire(key, TTL)
                .exec((err, results) => {
                    debug('results:', results);
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore if: please write tests */
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else: please write tests */
                        if (Number.isInteger(results[0])) {
                            const no: number = results[0];
                            debug('no incremented.', no);
                            resolve(no);
                        } else {
                            // 基本的にありえないフロー
                            reject(new factory.errors.ServiceUnavailable('Confirmation number not published'));
                        }
                    }
                });
        });
    }
}
