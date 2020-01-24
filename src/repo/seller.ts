import { Connection, Model } from 'mongoose';
import { modelName } from './mongoose/model/organization';

import * as factory from '../factory';

export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

/**
 * 販売者リポジトリ
 */
export class MongoRepository {
    public readonly organizationModel: typeof Model;

    constructor(connection: Connection) {
        this.organizationModel = connection.model(modelName);
    }

    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.seller.ISearchConditions) {
        // MongoDB検索条件
        const andConditions: any[] = [
            {
                paymentAccepted: { $exists: true }
            }
        ];

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

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.typeOfs)) {
            andConditions.push({
                typeOf: { $in: params.typeOfs }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.name !== undefined) {
            andConditions.push({
                $or: [
                    {
                        'name.ja': {
                            $exists: true,
                            $regex: new RegExp(params.name)
                        }
                    },
                    {
                        'name.en': {
                            $exists: true,
                            $regex: new RegExp(params.name)
                        }
                    }
                ]
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.location !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.location.typeOfs !== undefined) {
                andConditions.push({
                    'location.typeOf': {
                        $exists: true,
                        $in: params.location.typeOfs
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.location.branchCodes !== undefined) {
                andConditions.push({
                    'location.branchCode': {
                        $exists: true,
                        $in: params.location.branchCodes
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.location.name !== undefined) {
                andConditions.push({
                    $or: [
                        {
                            'location.name.ja': {
                                $exists: true,
                                $regex: new RegExp(params.location.name)
                            }
                        },
                        {
                            'location.name.en': {
                                $exists: true,
                                $regex: new RegExp(params.location.name)
                            }
                        }
                    ]
                });
            }
        }

        return andConditions;
    }

    /**
     * 特定販売者検索
     */
    public async findById(
        conditions: {
            id: string;
        },
        projection?: any
    ): Promise<ISeller> {
        const doc = await this.organizationModel.findOne(
            {
                paymentAccepted: { $exists: true },
                _id: conditions.id
            },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0,
                ...projection
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.organizationModel.modelName);
        }

        return doc.toObject();
    }

    /**
     * 販売者を保管する
     */
    public async save<T extends factory.organizationType>(params: {
        id?: string;
        attributes: factory.seller.IAttributes<T>;
    }): Promise<ISeller> {
        let organization: ISeller;
        if (params.id === undefined) {
            const doc = await this.organizationModel.create(params.attributes);
            organization = doc.toObject();
        } else {
            const doc = await this.organizationModel.findOneAndUpdate(
                {
                    paymentAccepted: { $exists: true },
                    _id: params.id
                },
                params.attributes,
                { upsert: false, new: true }
            )
                .exec();
            if (doc === null) {
                throw new factory.errors.NotFound(this.organizationModel.modelName);
            }
            organization = doc.toObject();
        }

        return organization;
    }

    public async count(params: factory.seller.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.organizationModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 販売者検索
     */
    public async search(
        conditions: factory.seller.ISearchConditions,
        projection?: any
    ): Promise<ISeller[]> {
        const andConditions = MongoRepository.CREATE_MONGO_CONDITIONS(conditions);

        const query = this.organizationModel.find(
            (andConditions.length > 0) ? { $and: andConditions } : {},
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0,
                ...projection
            }
        );

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (conditions.limit !== undefined && conditions.page !== undefined) {
            query.limit(conditions.limit)
                .skip(conditions.limit * (conditions.page - 1));
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (conditions.sort !== undefined) {
            query.sort(conditions.sort);
        }

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    /**
     * 販売者を削除する
     */
    public async deleteById(params: {
        id: string;
    }): Promise<void> {
        await this.organizationModel.findOneAndRemove(
            {
                paymentAccepted: { $exists: true },
                _id: params.id
            }
        )
            .exec();
    }
}
