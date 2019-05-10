import * as createDebug from 'debug';
import * as moment from 'moment';
import { Connection, Model } from 'mongoose';
import { RedisClient } from 'redis';
import * as uuid from 'uuid';

import * as factory from '../factory';

import { modelName } from './mongoose/model/authorization';

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
        project: factory.project.IProject;
        data: IData;
        validFrom: Date;
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
    // public async remove(params: { code: ICode }): Promise<void> {
    //     const key = `${REDIS_KEY_PREFIX}:${params.code}`;
    //     await new Promise<void>((resolve) => {
    //         this.redisClient.del(key, () => {
    //             resolve();
    //         });
    //     });
    // }

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

/**
 * コードリポジトリ
 */
export class MongoRepository {
    public readonly authorizationModel: typeof Model;

    constructor(connection: Connection) {
        this.authorizationModel = connection.model(modelName);
    }

    /**
     * コードを発行する
     */
    public async publish(params: {
        project: factory.project.IProject;
        data: IData;
        validFrom: Date;
        expiresInSeconds: number;
    }): Promise<ICode> {
        const code = uuid.v4();

        await this.save({
            project: params.project,
            code: code,
            data: params.data,
            validFrom: params.validFrom,
            expiresInSeconds: params.expiresInSeconds
        });

        return code;
    }

    /**
     * コードでデータを検索する
     */
    public async findOne(params: { code: ICode }): Promise<IData> {
        const now = new Date();

        const doc = await this.authorizationModel.findOne({
            code: {
                $exists: true,
                $eq: params.code
            },
            validFrom: {
                $exists: true,
                $lte: now
            },
            validUntil: {
                $exists: true,
                $gte: now
            }
        })
            .exec();

        if (doc === null) {
            throw new factory.errors.NotFound(this.authorizationModel.modelName);
        }

        const authorization = doc.toObject();

        return authorization.object;
    }

    /**
     * コードを保管する
     */
    private async save(params: {
        project: factory.project.IProject;
        code: ICode;
        data: IData;
        validFrom: Date;
        expiresInSeconds: number;
    }): Promise<void> {
        const validUntil = moment(params.validFrom)
            .add(params.expiresInSeconds, 'seconds')
            .toDate();

        await this.authorizationModel.create({
            project: params.project,
            typeOf: 'Authorization',
            code: params.code,
            object: params.data,
            validFrom: params.validFrom,
            validUntil: validUntil
        });
    }
}
