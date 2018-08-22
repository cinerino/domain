import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';
import { RedisClient } from 'redis';

const debug = createDebug('cinerino-domain:*');
const REDIS_KEY_PREFIX = 'cinerino-domain:code';
const CODE_EXPIRES_IN_SECONDS = 600;

export type IData = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

/**
 * コードリポジトリー
 */
export class RedisRepository {
    public readonly redisClient: RedisClient;
    constructor(redisClient: RedisClient) {
        this.redisClient = redisClient;
    }
    public async findOne(code: string): Promise<IData> {
        const key = `${REDIS_KEY_PREFIX}:${code}`;

        return new Promise<any>((resolve, reject) => {
            this.redisClient.get(key, (err, value) => {
                if (err instanceof Error) {
                    reject();

                    return;
                }

                resolve((value === null) ? null : JSON.parse(value));
            });
        });
    }
    public async save(params: {
        code: string;
        data: IData;
    }): Promise<void> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;
        await new Promise<void>((resolve, reject) => {
            this.redisClient.multi()
                .set(key, JSON.stringify(params.data))
                .expire(key, CODE_EXPIRES_IN_SECONDS, debug)
                .exec((err) => {
                    if (err instanceof Error) {
                        reject(err);

                        return;
                    }

                    resolve();
                });
        });
    }
    public async remove(code: string): Promise<void> {
        const key = `${REDIS_KEY_PREFIX}:${code}`;
        await new Promise<void>((resolve) => {
            this.redisClient.del(key, () => {
                resolve();
            });
        });
    }
}
