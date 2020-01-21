import * as moment from 'moment';
import { Connection, Model } from 'mongoose';
import * as uuid from 'uuid';

import * as factory from '../factory';

import { modelName } from './mongoose/model/authorization';

export type IData = any;
export type ICode = string;

/**
 * 承認コードリポジトリ
 */
export class MongoRepository {
    public readonly authorizationModel: typeof Model;

    constructor(connection: Connection) {
        this.authorizationModel = connection.model(modelName);
    }

    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.authorization.ISearchConditions) {
        const andConditions: any[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.project !== undefined) {
            if (Array.isArray(params.project.ids)) {
                andConditions.push({
                    'project.id': {
                        $exists: true,
                        $in: params.project.ids
                    }
                });
            }

            if ((<any>params).project.id !== undefined && (<any>params).project.id !== null) {
                if (typeof (<any>params).project.id.$eq === 'string') {
                    andConditions.push({
                        'project.id': {
                            $exists: true,
                            $eq: (<any>params).project.id.$eq
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.id !== undefined) {
            if (Array.isArray(params.id.$in)) {
                andConditions.push({
                    _id: { $in: params.id.$in }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.code !== undefined) {
            if (Array.isArray(params.code.$in)) {
                andConditions.push({
                    code: { $exists: true, $in: params.code.$in }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        const object = <factory.authorization.IObjectSearchConditions>params.object;
        if (object !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(object.ids)) {
                andConditions.push({
                    'object.id': {
                        $exists: true,
                        $in: object.ids
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(object.typeOfs)) {
                andConditions.push({
                    'object.typeOf': {
                        $exists: true,
                        $in: object.typeOfs
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (object.typeOfGood !== undefined) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(object.typeOfGood.ids)) {
                    andConditions.push({
                        'object.typeOfGood.id': {
                            $exists: true,
                            $in: object.typeOfGood.ids
                        }
                    });
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(object.typeOfGood.typeOfs)) {
                    andConditions.push({
                        'object.typeOfGood.typeOf': {
                            $exists: true,
                            $in: object.typeOfGood.typeOfs
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.codes)) {
            andConditions.push({
                code: { $exists: true, $in: params.codes }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.validFrom instanceof Date) {
            andConditions.push({
                validUntil: { $exists: true, $gte: params.validFrom }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.validThrough instanceof Date) {
            andConditions.push({
                validFrom: { $lte: params.validThrough }
            });
        }

        return andConditions;
    }

    /**
     * コードを発行する
     */
    public async publish(params: {
        project: factory.project.IProject;
        data: IData;
        validFrom: Date;
        expiresInSeconds: number;
    }): Promise<factory.authorization.IAuthorization> {
        const code = uuid.v4();

        return this.save({
            project: params.project,
            code: code,
            data: params.data,
            validFrom: params.validFrom,
            expiresInSeconds: params.expiresInSeconds
        });
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

    public async count(params: factory.authorization.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.authorizationModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    public async search(params: factory.authorization.ISearchConditions): Promise<factory.authorization.IAuthorization[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.authorizationModel.find(
            (conditions.length > 0) ? { $and: conditions } : {},
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        );
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.limit !== undefined && params.page !== undefined) {
            query.limit(params.limit)
                .skip(params.limit * (params.page - 1));
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
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
    }): Promise<factory.authorization.IAuthorization> {
        const validUntil = moment(params.validFrom)
            .add(params.expiresInSeconds, 'seconds')
            .toDate();

        return this.authorizationModel.create({
            project: params.project,
            typeOf: 'Authorization',
            code: params.code,
            object: params.data,
            validFrom: params.validFrom,
            validUntil: validUntil
        });
    }
}
