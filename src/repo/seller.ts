import { Connection } from 'mongoose';
import organizationModel from './mongoose/model/organization';

import * as factory from '../factory';

/**
 * 販売者リポジトリ
 */
export class MongoRepository {
    public readonly organizationModel: typeof organizationModel;

    constructor(connection: Connection) {
        this.organizationModel = connection.model(organizationModel.modelName);
    }

    public static CREATE_MONGO_CONDITIONS(params: factory.organization.ISearchConditions<factory.organizationType>) {
        // MongoDB検索条件
        const andConditions: any[] = [
            {
                paymentAccepted: { $exists: true }
            }
        ];

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
                            $regex: new RegExp(params.name, 'i')
                        }
                    },
                    {
                        'name.en': {
                            $exists: true,
                            $regex: new RegExp(params.name, 'i')
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
                                $regex: new RegExp(params.location.name, 'i')
                            }
                        },
                        {
                            'location.name.en': {
                                $exists: true,
                                $regex: new RegExp(params.location.name, 'i')
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
    public async findById<T extends factory.organizationType>(params: {
        id: string;
    }): Promise<factory.organization.IOrganization<T>> {
        const doc = await this.organizationModel.findOne(
            {
                paymentAccepted: { $exists: true },
                _id: params.id
            },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Organization');
        }

        return doc.toObject();
    }

    /**
     * 組織を保管する
     */
    public async save<T extends factory.organizationType>(params: {
        id?: string;
        attributes: factory.organization.IAttributes<T>;
    }): Promise<factory.organization.IOrganization<T>> {
        let organization: factory.organization.IOrganization<T>;
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
                throw new factory.errors.NotFound('Organization');
            }
            organization = doc.toObject();
        }

        return organization;
    }

    public async count(params: factory.organization.ISearchConditions<factory.organizationType>): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.organizationModel.countDocuments(
            { $and: conditions }
        )
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 販売者検索
     */
    public async search(
        params: factory.organization.ISearchConditions<factory.organizationType>
    ): Promise<factory.organization.IOrganization<factory.organizationType>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.organizationModel.find(
            { $and: conditions },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0,
                // GMOのセキュアな情報を公開しないように注意
                'paymentAccepted.gmoInfo.shopPass': 0
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
     * 組織を削除する
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
