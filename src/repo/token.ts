import * as createDebug from 'debug';
import * as jwt from 'jsonwebtoken';
import * as redis from 'redis';

import * as factory from '../factory';

const debug = createDebug('ttts-domain:repository');
const SECRET = <string>process.env.TTTS_TOKEN_SECRET;

/**
 * 印刷トークンインターフェース
 */
export type IPrintToken = string;
/**
 * 印刷トークン対象(予約IDリスト)インターフェース
 */
export type IPrintObject = string[];

/**
 * ttts専用トークンリポジトリ
 */
export class RedisRepository {
    public static PRINT_TOKEN_KEY_PREFIX: string = 'token.print.';
    public readonly redisClient: redis.RedisClient;

    constructor(redisClient: redis.RedisClient) {
        this.redisClient = redisClient;
    }

    /**
     * 予約印刷トークンを発行する
     */
    public async createPrintToken(object: IPrintObject): Promise<IPrintToken> {
        return new Promise<IPrintToken>((resolve, reject) => {
            // JWT作成]
            const payload = {
                object: object
            };
            jwt.sign(payload, SECRET, (jwtErr, token) => {
                if (jwtErr instanceof Error) {
                    reject(jwtErr);
                } else {
                    const key = `${RedisRepository.PRINT_TOKEN_KEY_PREFIX}${token}`;
                    const ttl = 600;

                    this.redisClient.multi()
                        .setnx(key, '1', debug)
                        .expire(key, ttl, debug)
                        .exec((err, results) => {
                            debug('results:', results);
                            if (err !== null) {
                                reject(err);
                            } else {
                                if (results[0] === 1) {
                                    resolve(token);
                                } else {
                                    reject(new factory.errors.AlreadyInUse('token', ['key']));
                                }
                            }
                        });
                }
            });
        });
    }

    /**
     * 印刷トークンを検証する
     */
    public async verifyPrintToken(token: IPrintToken): Promise<IPrintObject> {
        return new Promise<IPrintObject>((resolve, reject) => {
            jwt.verify(token, SECRET, (jwtErr, decoded: any) => {
                if (jwtErr instanceof Error) {
                    reject(jwtErr);
                } else {
                    const key = `${RedisRepository.PRINT_TOKEN_KEY_PREFIX}${token}`;

                    this.redisClient.get(key, (err, result) => {
                        debug('result:', err, result);
                        if (err !== null) {
                            reject(err);
                        } else {
                            if (decoded.object === undefined) {
                                reject(new factory.errors.NotFound('token'));
                            } else {
                                resolve(decoded.object);
                            }
                        }
                    });
                }
            });
        });
    }
}
