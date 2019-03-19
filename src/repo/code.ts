import * as createDebug from 'debug';
import { RedisClient } from 'redis';
import * as uuid from 'uuid';

import * as factory from '../factory';

const debug = createDebug('cinerino-domain:repository');
const REDIS_KEY_PREFIX = 'cinerino:code';
export type IData = any;
export type ICode = string;
/**
 * コードリポジトリ
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
        expiresInSeconds: number;
    }): Promise<ICode> {
        const code = uuid.v4();
        await this.save({
            code: code,
            data: params.data,
            expiresInSeconds: params.expiresInSeconds
        });

        return code;
    }
    /**
     * コードを削除する
     */
    public async remove(params: { code: ICode }): Promise<void> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;
        await new Promise<void>((resolve) => {
            this.redisClient.del(key, () => {
                resolve();
            });
        });
    }
    /**
     * コードでデータを検索する
     */
    public async findOne(params: { code: ICode }): Promise<IData> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;

        return new Promise<IData>((resolve, reject) => {
            this.redisClient.get(key, (err, value) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    if (value === null) {
                        reject(new factory.errors.NotFound('Code'));
                    } else {
                        resolve(JSON.parse(value));
                    }
                }
            });
        });
    }
    /**
     * コードを保管する
     */
    private async save(params: {
        code: ICode;
        data: IData;
        expiresInSeconds: number;
    }): Promise<void> {
        const key = `${REDIS_KEY_PREFIX}:${params.code}`;
        await new Promise<void>((resolve, reject) => {
            this.redisClient.multi()
                .set(key, JSON.stringify(params.data))
                .expire(key, params.expiresInSeconds, debug)
                .exec((err) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }
}
