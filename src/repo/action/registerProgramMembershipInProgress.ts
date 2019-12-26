import * as createDebug from 'debug';
import * as redis from 'redis';

const debug = createDebug('cinerino:repository');

/**
 * 進行アクションキーインターフェース
 */
export interface IProgressKey {
    id: string;
    programMembershipId: string;
}

/**
 * 進行中の会員プログラム登録アクションリポジトリ
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
    public async lock(progressKey: IProgressKey, actionId: string): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const key = `${RedisRepository.KEY_PREFIX}:${progressKey.id}:${progressKey.programMembershipId}`;
            const ttl = 7200;
            debug('locking...', key, ttl);
            this.redisClient.multi()
                .setnx(key, actionId, debug)
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
     * 会員プログラム進行ロックを解除する
     */
    public async unlock(progressKey: IProgressKey) {
        return new Promise<void>((resolve, reject) => {
            const key = `${RedisRepository.KEY_PREFIX}:${progressKey.id}:${progressKey.programMembershipId}`;
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
}
