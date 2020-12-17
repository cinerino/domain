import { Connection, Document, Model, QueryCursor } from 'mongoose';
import * as uuid from 'uuid';

import { modelName } from './mongoose/model/ownershipInfo';

import { MongoErrorCode } from '../errorHandler';
import * as factory from '../factory';

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;

/**
 * 所有権リポジトリ
 */
export class MongoRepository {
    public readonly ownershipInfoModel: typeof Model;

    constructor(connection: Connection) {
        this.ownershipInfoModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.ownershipInfo.ISearchConditions) {
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

            if (params.project.id !== undefined && params.project.id !== null) {
                if (typeof params.project.id.$eq === 'string') {
                    andConditions.push({
                        'project.id': {
                            $exists: true,
                            $eq: params.project.id.$eq
                        }
                    });
                }
            }
        }

        const typeOfGoodIdentifierEq = params.typeOfGood?.identifier?.$eq;
        if (typeof typeOfGoodIdentifierEq === 'string') {
            andConditions.push({
                'typeOfGood.identifier': {
                    $exists: true,
                    $eq: typeOfGoodIdentifierEq
                }
            });
        }

        const typeOfGoodIssuedThroughIdEq = params.typeOfGood?.issuedThrough?.id?.$eq;
        if (typeof typeOfGoodIssuedThroughIdEq === 'string') {
            andConditions.push({
                'typeOfGood.issuedThrough.id': {
                    $exists: true,
                    $eq: typeOfGoodIssuedThroughIdEq
                }
            });
        }

        const typeOfGoodIssuedThroughTypeOfEq = params.typeOfGood?.issuedThrough?.typeOf?.$eq;
        if (typeof typeOfGoodIssuedThroughTypeOfEq === 'string') {
            andConditions.push({
                'typeOfGood.issuedThrough.typeOf': {
                    $exists: true,
                    $eq: typeOfGoodIssuedThroughTypeOfEq
                }
            });
        }

        const typeOfGoodTypeOf = params.typeOfGood?.typeOf;
        if (typeof typeOfGoodTypeOf === 'string') {
            andConditions.push({
                'typeOfGood.typeOf': {
                    $exists: true,
                    $eq: typeOfGoodTypeOf
                }
            });
        } else {
            const typeOfGoodTypeOfEq = typeOfGoodTypeOf?.$eq;
            if (typeof typeOfGoodTypeOfEq === 'string') {
                andConditions.push({
                    'typeOfGood.typeOf': {
                        $exists: true,
                        $eq: typeOfGoodTypeOfEq
                    }
                });
            }

            const typeOfGoodTypeOfIn = typeOfGoodTypeOf?.$in;
            if (Array.isArray(typeOfGoodTypeOfIn)) {
                andConditions.push({
                    'typeOfGood.typeOf': {
                        $exists: true,
                        $in: typeOfGoodTypeOfIn
                    }
                });
            }
        }

        // 互換性維持対応
        if (params.typeOfGood === undefined || params.typeOfGood === null) {
            params.typeOfGood = {};
        }
        if (typeof (<any>params.typeOfGood).accountNumber === 'string') {
            params.typeOfGood.accountNumber = { $eq: (<any>params.typeOfGood).accountNumber };
        }
        if (Array.isArray((<any>params.typeOfGood).accountNumbers)) {
            params.typeOfGood.accountNumber = { $in: (<any>params.typeOfGood).accountNumbers };
        }
        if (typeof (<any>params.typeOfGood).id === 'string') {
            params.typeOfGood.id = { $eq: (<any>params.typeOfGood).id };
        }
        if (Array.isArray((<any>params.typeOfGood).ids)) {
            params.typeOfGood.id = { $in: (<any>params.typeOfGood).ids };
        }

        const typeOfGoodAccountNumberEq = params.typeOfGood?.accountNumber?.$eq;
        if (typeof typeOfGoodAccountNumberEq === 'string') {
            andConditions.push({
                'typeOfGood.accountNumber': {
                    $exists: true,
                    $eq: typeOfGoodAccountNumberEq
                }
            });
        }

        const typeOfGoodAccountNumberIn = params.typeOfGood?.accountNumber?.$in;
        if (Array.isArray(typeOfGoodAccountNumberIn)) {
            andConditions.push({
                'typeOfGood.accountNumber': {
                    $exists: true,
                    $in: typeOfGoodAccountNumberIn
                }
            });
        }

        const typeOfGoodIdEq = params.typeOfGood?.id?.$eq;
        if (typeof typeOfGoodIdEq === 'string') {
            andConditions.push({
                'typeOfGood.id': {
                    $exists: true,
                    $eq: typeOfGoodIdEq
                }
            });
        }

        const typeOfGoodIdIn = params.typeOfGood?.id?.$in;
        if (Array.isArray(typeOfGoodIdIn)) {
            andConditions.push({
                'typeOfGood.id': {
                    $exists: true,
                    $in: typeOfGoodIdIn
                }
            });
        }

        const typeOfGoodAccountType = params.typeOfGood?.accountType;
        if (typeof typeOfGoodAccountType === 'string') {
            andConditions.push({
                'typeOfGood.accountType': {
                    $exists: true,
                    $eq: typeOfGoodAccountType
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.ids)) {
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
    public async saveByIdentifier(ownershipInfo: IOwnershipInfo): Promise<IOwnershipInfo> {
        let doc: Document | undefined;
        let duplicate = false;

        try {
            doc = await this.ownershipInfoModel.findOneAndUpdate(
                { identifier: ownershipInfo.identifier },
                {
                    $set: ownershipInfo,
                    $setOnInsert: { _id: uuid.v4() } // 新規作成時は所有権ID発行
                },
                { new: true, upsert: true }
            )
                .exec();
        } catch (error) {
            if (error.name === 'MongoError') {
                // すでに所有権が存在する場合ok
                if (error.code === MongoErrorCode.DuplicateKey) {
                    duplicate = true;
                }
            }

            if (!duplicate) {
                throw error;
            }
        }

        if (duplicate) {
            // 重複の場合、再度更新
            doc = await this.ownershipInfoModel.findOneAndUpdate(
                { identifier: ownershipInfo.identifier },
                { $set: ownershipInfo },
                { new: true }
            )
                .exec();
        }

        if (doc === undefined) {
            throw new factory.errors.NotFound(this.ownershipInfoModel.modelName);
        }

        return doc.toObject();
    }

    public async findById(params: { id: string }): Promise<IOwnershipInfo> {
        const doc = await this.ownershipInfoModel.findById(params.id)
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.ownershipInfoModel.modelName);
        }

        return doc.toObject();
    }

    public async count(params: factory.ownershipInfo.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.ownershipInfoModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 所有権を検索する
     */
    public async search(
        params: factory.ownershipInfo.ISearchConditions
    ): Promise<IOwnershipInfo[]> {
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

    public stream(params: factory.ownershipInfo.ISearchConditions): QueryCursor<Document> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.ownershipInfoModel.find((conditions.length > 0) ? { $and: conditions } : {})
            .select({ __v: 0, createdAt: 0, updatedAt: 0 });

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

        return query.cursor();
    }
}
