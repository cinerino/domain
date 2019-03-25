import * as createDebug from 'debug';
import * as moment from 'moment-timezone';
import * as redis from 'redis';
import { format } from 'util';

const debug = createDebug('cinerino-domain:repository');

const REDIS_KEY_PREFIX = 'cinerino:event:remainingAttendeeCapacity';

const TTL = 864000;

export interface IEvent {
    id: string;
    remainingAttendeeCapacity?: number;
}

/**
 * イベント残席数リポジトリ
 */
export class RedisRepository {
    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    public static CREATE_REDIS_KEY() {
        return format(
            '%s:%s',
            REDIS_KEY_PREFIX,
            moment()
                .tz('Asia/Tokyo')
                .format('YYYY-MM-DD')
        );
    }

    /**
     * イベントIDで検索する
     */
    public async findByEventIds(params: string[]): Promise<IEvent[]> {
        if (params.length === 0) {
            return [];
        }

        const key = RedisRepository.CREATE_REDIS_KEY();

        return new Promise<IEvent[]>((resolve, reject) => {
            this.redisClient.hmget(key, params, (err, res) => {
                debug('hmget processed', err, res);
                if (err instanceof Error) {
                    reject(err);
                } else {
                    if (Array.isArray(res)) {
                        resolve(params.map((id, i) => {
                            return {
                                id: id,
                                remainingAttendeeCapacity: (typeof res[i] === 'string') ? Number(res[i]) : undefined
                            };
                        }));
                    } else {
                        resolve(params.map((id) => {
                            return {
                                id: id,
                                remainingAttendeeCapacity: undefined
                            };
                        }));
                    }
                }
            });
        });
    }

    /**
     * 残席数を更新する
     */
    public async updateByEventIds(params: IEvent[]): Promise<void> {
        if (params.length === 0) {
            return;
        }

        const key = RedisRepository.CREATE_REDIS_KEY();

        const args: string[] = [];
        params.forEach((p) => {
            args.push(String(p.id), String(p.remainingAttendeeCapacity));
        });

        return new Promise<void>(async (resolve, reject) => {
            debug('executing hmset', args);
            this.redisClient.multi()
                .hmset(key, ...args)
                .expire(key, TTL)
                .exec((err, results) => {
                    debug('results:', results);
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore if: please write tests */
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        if (results[0] !== undefined && results[0] === 'OK') {
                            resolve();
                        } else {
                            reject(new Error(`Unexpected error occurred. results[0]: ${results[0]}`));
                        }
                    }
                });
        });
    }
}
