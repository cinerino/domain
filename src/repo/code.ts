import * as moment from 'moment';
import { Connection, Model } from 'mongoose';
import * as uuid from 'uuid';

import * as factory from '../factory';

import { modelName } from './mongoose/model/authorization';

export type IData = any;

export type ICode = string;

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
