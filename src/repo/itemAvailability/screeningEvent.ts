import * as createDebug from 'debug';
import * as redis from 'redis';

const debug = createDebug('cinerino-domain:repository');
const REDIS_KEY_PREFIX = 'cinerino:itemAvailability:screeningEvent';
/**
 * イベント在庫状況のRedisで有効期間
 */
const TIMEOUT_IN_SECONDS = 864000;

/**
 * イベント在庫状況リポジトリ
 */
export class RedisRepository {
    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * イベントの上映日からredisキーを生成する
     */
    public static CREATE_REDIS_KEY(screeningDay: string): string {
        return `${REDIS_KEY_PREFIX}:${screeningDay}`;
    }

    /**
     * 在庫状況をひとつ取得する
     */
    public async findOne(screeningDay: string, eventId: string):
        Promise<number | null> {
        const key = RedisRepository.CREATE_REDIS_KEY(screeningDay);

        return new Promise<number | null>((resolve, reject) => {
            // イベント在庫状況を取得
            this.redisClient.hget(key, eventId, (err, res) => {
                debug('hget processed.', err, res);
                if (err instanceof Error) {
                    reject(err);

                    return;
                }

                // 存在しなければすぐ返却
                if (res === null) {
                    resolve(res);

                    return;
                }

                // tslint:disable-next-line:no-magic-numbers
                const itemAvailability = parseInt(res.toString(), 10);
                resolve(itemAvailability);
            });
        });
    }

    /**
     * 在庫状況をひとつ更新する
     */
    public async updateOne(
        screeningDay: string,
        eventId: string,
        itemAvailability: number
    ): Promise<void> {
        const key = RedisRepository.CREATE_REDIS_KEY(screeningDay);

        return new Promise<void>(async (resolve, reject) => {
            this.redisClient.hset(key, eventId, itemAvailability.toString(), (err) => {
                debug('hset processed.', err);
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 上映日から在庫状況を削除する
     */
    public async removeByPerformaceDay(screeningDay: string): Promise<void> {
        const key = RedisRepository.CREATE_REDIS_KEY(screeningDay);

        return new Promise<void>(async (resolve, reject) => {
            this.redisClient.del([key], (err) => {
                debug('del processed.', err);
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 上映日から在庫状況に期限をセットする
     */
    public async setTTLIfNotExist(screeningDay: string): Promise<void> {
        const key = RedisRepository.CREATE_REDIS_KEY(screeningDay);

        return new Promise<void>((resolve, reject) => {
            this.redisClient.ttl(key, (err, ttl) => {
                debug('ttl:', ttl);
                if (err instanceof Error) {
                    reject(err);

                    return;
                }

                // 存在していれば何もしない
                if (ttl > -1) {
                    resolve();

                    return;
                }

                // 期限セット
                this.redisClient.expire(key, TIMEOUT_IN_SECONDS, () => {
                    debug('set expire.', key, TIMEOUT_IN_SECONDS);
                    resolve();
                });
            });
        });
    }
}
