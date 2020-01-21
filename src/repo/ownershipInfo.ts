import { Connection, Model } from 'mongoose';
import * as uuid from 'uuid';

import { modelName } from './mongoose/model/ownershipInfo';

import * as factory from '../factory';

export type IOwnershipInfo<T extends factory.ownershipInfo.IGoodType> =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<T>>;

/**
 * 所有権リポジトリ
 */
export class MongoRepository {
    public readonly ownershipInfoModel: typeof Model;

    constructor(connection: Connection) {
        this.ownershipInfoModel = connection.model(modelName);
    }

    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS<T extends factory.ownershipInfo.IGoodType>(
        params: factory.ownershipInfo.ISearchConditions<T>
    ) {
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
        const typeOfGood = params.typeOfGood;
        if (typeOfGood !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (typeof typeOfGood.typeOf === 'string') {
                andConditions.push({
                    'typeOfGood.typeOf': {
                        $exists: true,
                        $eq: typeOfGood.typeOf
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (typeof typeOfGood.id === 'string') {
                andConditions.push({
                    'typeOfGood.id': {
                        $exists: true,
                        $eq: typeOfGood.id
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(typeOfGood.ids)) {
                andConditions.push({
                    'typeOfGood.id': {
                        $exists: true,
                        $in: typeOfGood.ids
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (typeof typeOfGood.accountType === 'string') {
                andConditions.push({
                    'typeOfGood.accountType': {
                        $exists: true,
                        $eq: typeOfGood.accountType
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (typeof typeOfGood.accountNumber === 'string') {
                andConditions.push({
                    'typeOfGood.accountNumber': {
                        $exists: true,
                        $eq: typeOfGood.accountNumber
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(typeOfGood.accountNumbers)) {
                andConditions.push({
                    'typeOfGood.accountNumber': {
                        $exists: true,
                        $in: typeOfGood.accountNumbers
                    }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.ids !== undefined) {
            andConditions.push({
                _id: { $in: params.ids }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray((<any>params).identifiers)) {
            andConditions.push({
                identifier: {
                    $exists: true,
                    $in: (<any>params).identifiers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.ownedBy !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.ownedBy.id !== undefined) {
                andConditions.push({
                    'ownedBy.id': {
                        $exists: true,
                        $eq: params.ownedBy.id
                    }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.ownedFrom instanceof Date) {
            andConditions.push({
                ownedThrough: { $gte: params.ownedFrom }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.ownedThrough instanceof Date) {
            andConditions.push({
                ownedFrom: { $lte: params.ownedThrough }
            });
        }

        return andConditions;
    }

    /**
     * 所有権情報を保管する
     */
    public async save(
        ownershipInfo: IOwnershipInfo<factory.ownershipInfo.IGoodType>
    ): Promise<IOwnershipInfo<factory.ownershipInfo.IGoodType>> {
        // 所有権ID発行
        const id = uuid.v4();

        return this.ownershipInfoModel.create({ ...ownershipInfo, _id: id })
            .then((doc) => doc.toObject());
    }

    /**
     * 所有権情報を保管する
     */
    public async saveByIdentifier(
        ownershipInfo: IOwnershipInfo<factory.ownershipInfo.IGoodType>
    ): Promise<IOwnershipInfo<factory.ownershipInfo.IGoodType>> {
        return this.ownershipInfoModel.findOneAndUpdate(
            { identifier: ownershipInfo.identifier },
            {
                $set: ownershipInfo,
                $setOnInsert: { _id: uuid.v4() } // 新規作成時は所有権ID発行
            },
            { new: true, upsert: true }
        )
            .exec()
            .then((doc) => doc.toObject());
    }

    public async findById(params: { id: string }): Promise<IOwnershipInfo<factory.ownershipInfo.IGoodType>> {
        const doc = await this.ownershipInfoModel.findById(params.id)
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound('OwnershipInfo');
        }

        return doc.toObject();
    }

    public async count<T extends factory.ownershipInfo.IGoodType>(
        params: factory.ownershipInfo.ISearchConditions<T>
    ): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.ownershipInfoModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 所有権を検索する
     */
    public async search<T extends factory.ownershipInfo.IGoodType>(
        params: factory.ownershipInfo.ISearchConditions<T>
    ): Promise<IOwnershipInfo<T>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.ownershipInfoModel.find(
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
}
