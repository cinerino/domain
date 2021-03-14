import * as createDebug from 'debug';
import * as redis from 'redis';

const debug = createDebug('cinerino:repository');

/**
 * 進行アクションキーインターフェース
 */
export interface IProgressKey {
    agent: { id: string };
    product: { id: string };
}

/**
 * 進行中のサービス登録アクションリポジトリ
 */
export class RedisRepository {
    public static KEY_PREFIX: string = 'cinerino:registerProgramMembershipActionInProgress';

    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * ロックする
     */
    public async lock(progressKey: IProgressKey, holder: string): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const key = `${RedisRepository.KEY_PREFIX}:${progressKey.agent.id}:${progressKey.product.id}`;
            const ttl = 7200;
            debug('locking...', key, ttl);
            this.redisClient.multi()
                .setnx(key, holder, debug)
                .expire(key, ttl, debug)
                .exec((err, results) => {
                    debug('results:', results);
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore if: please write tests */
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else: please write tests */
                        if (results[0] === 1) {
                            resolve(results[0]);
                        } else {
                            reject(new Error('Already in progress.'));
                        }
                    }
                });
        });
    }

    /**
     * メンバーシップ登録進行ロックを解除する
     */
    public async unlock(progressKey: IProgressKey) {
        return new Promise<void>((resolve, reject) => {
            const key = `${RedisRepository.KEY_PREFIX}:${progressKey.agent.id}:${progressKey.product.id}`;
            this.redisClient.del([key], (err, res) => {
                debug(err, res);
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if: please write tests */
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    public async getHolder(progressKey: IProgressKey) {
        return new Promise<string | null>((resolve, reject) => {
            const key = `${RedisRepository.KEY_PREFIX}:${progressKey.agent.id}:${progressKey.product.id}`;
            this.redisClient.get(key, (err, res) => {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if: please write tests */
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }
}
