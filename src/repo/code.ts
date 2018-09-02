import * as createDebug from 'debug';
import { RedisClient } from 'redis';
import * as uuid from 'uuid';

const debug = createDebug('cinerino-domain:repository');
const REDIS_KEY_PREFIX = 'cinerino-domain:code';
const CODE_EXPIRES_IN_SECONDS = 600;

export type IData = any;
export type ICode = string;
/**
 * コードリポジトリー
 */
export class RedisRepository {
    public readonly redisClient: RedisClient;
    constructor(redisClient: RedisClient) {
        this.redisClient = redisClient;
    }
    /**
     * コードを発行する
     */
    public async publish(params: {
        data: IData;
    }): Promise<ICode> {
        const code = uuid.v4();
        await this.save({ code: code, data: params.data });

        return code;
    }
    public async remove(params: { code: ICode }): Promise<void> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;
        await new Promise<void>((resolve) => {
            this.redisClient.del(key, () => {
                resolve();
            });
        });
    }
    public async findOne(params: { code: ICode }): Promise<IData> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;

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
    private async save(params: {
        code: ICode;
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
}
