// tslint:disable:no-magic-numbers
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as redis from 'redis';

import * as factory from '../factory';

const debug = createDebug('cinerino-domain:repository');

/**
 * 購入番号リポジトリ(ttts専用)
 * @deprecated
 */
export class RedisRepository {
    /**
     * チェックディジットを算出する際の係数
     * {RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}と数が連動している必要がある
     */
    public static CHECK_DIGIT_WEIGHTS: number[] = [3, 4, 5, 2, 4];

    public static SORT_TYPES_PAYMENT_NO: number[][] = [
        [0, 2, 3, 1, 4],
        [1, 0, 4, 3, 2],
        [3, 2, 4, 1, 0],
        [0, 1, 3, 2, 4],
        [2, 0, 1, 4, 3],
        [1, 4, 0, 3, 2],
        [2, 3, 1, 0, 4],
        [4, 0, 2, 1, 3],
        [4, 2, 3, 0, 1],
        [2, 4, 0, 3, 1]
    ];

    /**
     * 採番対象名
     */
    public static REDIS_KEY_PREFIX: string = 'paymentNo';
    public static MAX_LENGTH_OF_SEQUENCE_NO: number = 5;

    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * 頭を指定文字列で埋める
     * @param input 元の文字列
     * @param length 最終的な文字列の長さ
     * @param padString 埋める文字列
     * @returns 結果文字列
     */
    public static PAD(input: string, length: number, padString: string) {
        return (padString.repeat(length) + input).slice(-length);
    }

    /**
     * チェックディジットを求める
     */
    public static GET_CHECK_DIGIT(source: string): number {
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
        return (checkDigit >= 10) ? 0 : checkDigit;
    }

    /**
     * チェックディジットを求める2
     */
    // public static GET_CHECK_DIGIT2(source: string): number {
    //     if (source.length !== RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO) {
    //         throw new factory.errors.Argument('source', `Source length must be ${RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}.`);
    //     }

    //     let sum = 0;
    //     source.split('').reverse().forEach((digitNumber, index) => {
    //         sum += parseInt(digitNumber, 10) * RedisRepository.CHECK_DIGIT_WEIGHTS[index];
    //     });

    //     return 9 - (sum % 9);
    // }

    /**
     * 購入番号の有効性をチェックする
     */
    public static VALIDATE(paymentNo: string): boolean {
        // if (paymentNo.length !== RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO + 2) {
        //     return false;
        // }
        if (paymentNo.length !== RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO + 1) {
            return false;
        }

        const sequeceNo = RedisRepository.DECODE(paymentNo);
        const checkDigit = RedisRepository.GET_CHECK_DIGIT(
            RedisRepository.PAD(sequeceNo.toString(), RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO, '0')
        );
        // const checkDigit2 = RedisRepository.getCheckDigit2(pad(sequeceNo.toString(), RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO, '0'));
        debug('validating...', paymentNo, sequeceNo, checkDigit);

        return (
            // parseInt(paymentNo.substr(-1), 10) === checkDigit
            parseInt(paymentNo.substr(0, 1), 10) === checkDigit
        );
    }

    /**
     * 購入番号をデコードする
     * @param paymentNo 購入番号
     * @returns 連番
     */
    public static DECODE(paymentNo: string): number {
        // 購入番号から、並び替えられた連番を取り出し、元の連番に並び替えなおす
        // const checkDigit = parseInt(paymentNo.substr(-1), 10);
        const checkDigit = parseInt(paymentNo.substr(0, 1), 10);
        // const strs = paymentNo.substr(1, paymentNo.length - 2);
        const strs = paymentNo.substr(1);
        const sortType = RedisRepository.SORT_TYPES_PAYMENT_NO[checkDigit];
        debug(checkDigit, strs, sortType);

        // tslint:disable-next-line:prefer-array-literal
        const source = Array.from(Array(RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO))
            .reduce(
                (a, __, weightNumber) => <string>a + strs.substr(sortType.indexOf(weightNumber), 1),
                ''
            );

        return Number(source);
    }

    /**
     * 購入番号を発行する
     * @param date 採番対象の日付
     */
    public async publish(date: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (!/^\d{8}$/.test(date)) {
                throw new factory.errors.Argument('date', 'Invalid date.');
            }

            // 上映日を過ぎたら期限が切れるようにTTLを設定
            const now = moment();
            const TTL = moment(`${date} 00:00:00+09:00`, 'YYYYMMDD HH:mm:ssZ')
                .add(1, 'day')
                .diff(now, 'seconds');
            debug(`TTL:${TTL} seconds`);
            const key = `${RedisRepository.REDIS_KEY_PREFIX}.${date}`;

            this.redisClient.multi()
                .incr(key, debug)
                .expire(key, TTL)
                .exec((err, results) => {
                    debug('results:', results);
                    if (err !== null) {
                        reject(err);
                    } else {
                        if (Number.isInteger(results[0])) {
                            const no: number = results[0];
                            debug('no incremented.', no);

                            // {RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO}桁になるように0で埋める
                            const source = RedisRepository.PAD(no.toString(), RedisRepository.MAX_LENGTH_OF_SEQUENCE_NO, '0');
                            const checKDigit = RedisRepository.GET_CHECK_DIGIT(source);
                            debug('source:', source, 'checKDigit:', checKDigit);

                            // sortTypes[checkDigit]で並べ替える
                            const sortType = RedisRepository.SORT_TYPES_PAYMENT_NO[checKDigit];
                            debug('sortType:', sortType);

                            resolve(`${checKDigit.toString()}${sortType.map((index) => source.substr(index, 1))
                                .join('')}`);
                        } else {
                            reject(new factory.errors.ServiceUnavailable());
                        }
                    }
                });
        });
    }
}
