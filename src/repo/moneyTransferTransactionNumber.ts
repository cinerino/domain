import * as cdigit from 'cdigit';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';
import * as redis from 'redis';
import * as util from 'util';

// tslint:disable-next-line:no-require-imports no-var-requires
const fpe = require('node-fpe');

import * as factory from '../factory';

const debug = createDebug('chevre-domain:repo');

/**
 * 通貨転送取引番号リポジトリ
 */
export class RedisRepository {
    public static REDIS_KEY_PREFIX: string = 'cinerino:moneyTransferTransactionNumber';
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
         * 取引開始日時
         */
        startDate: Date;
    }): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            // tslint:disable-next-line:no-magic-numbers
            const projectPrefix = params.project.id.slice(0, 3)
                .toUpperCase();
            const timestamp = moment(params.startDate)
                .valueOf()
                .toString();

            const now = moment();
            const TTL = moment(params.startDate)
                .add(1, 'minute') // ミリ秒でカウントしていくので、予約日時後1分で十分
                .diff(now, 'seconds');
            debug(`TTL:${TTL} seconds`);
            const key = util.format(
                '%s:%s:%s',
                RedisRepository.REDIS_KEY_PREFIX,
                projectPrefix,
                timestamp
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
                            let transactionNumber = timestamp;
                            const no: number = results[0];
                            debug('no incremented.', no);

                            transactionNumber = `${transactionNumber}${no}`;

                            // checkdigit
                            const cd = cdigit.luhn.compute(transactionNumber);

                            const cipher = fpe({ password: cd });
                            transactionNumber = cipher.encrypt(transactionNumber);

                            debug('publishing transactionNumber from', projectPrefix, timestamp, no, cd);
                            transactionNumber = `${projectPrefix}${cd}${transactionNumber}`;

                            resolve(transactionNumber);
                        } else {
                            // 基本的にありえないフロー
                            reject(new factory.errors.ServiceUnavailable('Transaction number not published'));
                        }
                    }
                });
        });
    }
}
