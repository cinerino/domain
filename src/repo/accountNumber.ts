// tslint:disable:no-magic-numbers
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as redis from 'redis';

import * as factory from '../factory';

const debug = createDebug('cinerino-domain:repository');

/**
 * 口座番号リポジトリー
 */
export class RedisRepository {
    /**
     * チェックディジットを算出する際の係数
     * {RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}と数が連動している必要がある
     */
    public static CHECK_DIGIT_WEIGHTS: number[] = [3, 1, 4, 2, 4, 1, 5, 4, 5, 3];
    public static SORT_TYPES: number[][] = [
        [1, 0, 7, 4, 5, 6, 8, 2, 3, 9],
        [2, 7, 4, 1, 6, 3, 9, 8, 0, 5],
        [6, 0, 4, 8, 3, 5, 1, 9, 7, 2],
        [2, 9, 4, 1, 8, 7, 6, 3, 0, 5],
        [4, 5, 2, 6, 9, 1, 7, 8, 0, 3],
        [6, 7, 9, 0, 3, 4, 2, 1, 8, 5],
        [8, 4, 6, 5, 0, 9, 1, 3, 2, 7],
        [0, 2, 6, 9, 5, 3, 7, 1, 8, 4],
        [1, 0, 7, 3, 5, 6, 2, 4, 9, 8],
        [7, 4, 0, 1, 3, 9, 6, 8, 5, 2]
    ];
    public static REDIS_KEY_PREFIX: string = 'cinerino:accountNumber';
    public static MAX_LENGTH_OF_SEQUENCE_NO: number = 10;
    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * チェックディジットを求める
     */
    private static calculateCheckDegit(source: string): number {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if: please write tests */
        if (source.length !== RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO) {
            throw new factory.errors.Argument('source', `Source length must be ${RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}.`);
        }

        let sum = 0;
        source.split('')
            .reverse()
            .forEach((digitNumber, index) => {
                sum += parseInt(digitNumber, 10) * RedisRepository.CHECK_DIGIT_WEIGHTS[index];
            });
        const checkDigit = 11 - (sum % 11);

        // 2桁の場合0、1桁であればそのまま(必ず1桁になるように)
        // tslint:disable-next-line:no-single-line-block-comment
        return (checkDigit < 10) ? /* istanbul ignore next */ checkDigit : /* istanbul ignore next */ 0;
    }

    /**
     * 口座番号を発行する
     * @param openDate 口座開設日時
     */
    public async publish(openDate: Date): Promise<string> {
        // 上映日を過ぎたら期限が切れるようにTTLを設定
        const now = moment();
        const TTL = moment(openDate)
            .add(1, 'day')
            .diff(now, 'seconds');
        debug(`TTL:${TTL} seconds`);
        const date = moment(openDate)
            .format('YYMMDD');
        const key = `${RedisRepository.REDIS_KEY_PREFIX}:${date}`;

        const results = await new Promise<any[]>((resolve, reject) => {
            this.redisClient.multi()
                .incr(key, debug)
                .expire(key, TTL)
                .exec((err, res) => {
                    debug('incr,expire executed.', err, res);
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore if: please write tests */
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
        });
        debug('results:', results);

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (results[0] === undefined || !Number.isInteger(results[0])) {
            // 基本的にありえないフロー
            throw new factory.errors.ServiceUnavailable();
        }

        const no: number = results[0];
        debug('no incremented.', no);

        // {RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}桁になるように0で埋める
        const source = `${date}${`0000${no.toString()}`.slice(-(RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO - date.length))}`;
        const checKDigit = RedisRepository.calculateCheckDegit(source);
        debug('source:', source, 'checKDigit:', checKDigit);

        // sortTypes[checkDigit]で並べ替える
        const sortType = RedisRepository.SORT_TYPES[checKDigit];
        debug('sortType:', sortType);

        return `${checKDigit.toString()}${sortType.map((index) => source.substr(index, 1))
            .join('')}`;
    }
}
