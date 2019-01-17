import { Connection } from 'mongoose';
import ownershipInfoModel from './mongoose/model/ownershipInfo';

import * as factory from '../factory';

export type IOwnershipInfo<T extends factory.ownershipInfo.IGoodType> =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<T>>;
/**
 * 所有権リポジトリー
 */
export class MongoRepository {
    public readonly ownershipInfoModel: typeof ownershipInfoModel;
    constructor(connection: Connection) {
        this.ownershipInfoModel = connection.model(ownershipInfoModel.modelName);
    }
    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS<T extends factory.ownershipInfo.IGoodType>(
        params: factory.ownershipInfo.ISearchConditions<T>
    ) {
        const andConditions: any[] = [
            {
                'typeOfGood.typeOf': params.typeOfGood.typeOf
            }
        ];
        const typeOfGood = <factory.ownershipInfo.ITypeOfGoodSearchConditions<typeof params.typeOfGood.typeOf>>params.typeOfGood;
        switch (typeOfGood.typeOf) {
            case factory.ownershipInfo.AccountGoodType.Account:
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeOfGood.accountType !== undefined) {
                    andConditions.push({
                        'typeOfGood.accountType': {
                            $exists: true,
                            $eq: typeOfGood.accountType
                        }
                    });
                }
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeOfGood.accountNumber !== undefined) {
                    andConditions.push({
                        'typeOfGood.accountNumber': {
                            $exists: true,
                            $eq: typeOfGood.accountNumber
                        }
                    });
                }
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeOfGood.accountNumbers !== undefined) {
                    andConditions.push({
                        'typeOfGood.accountNumber': {
                            $exists: true,
                            $in: typeOfGood.accountNumbers
                        }
                    });
                }
                break;
            case factory.chevre.reservationType.EventReservation:
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeOfGood.id !== undefined) {
                    andConditions.push({
                        'typeOfGood.id': {
                            $exists: true,
                            $eq: typeOfGood.id
                        }
                    });
                }
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeOfGood.ids !== undefined) {
                    andConditions.push({
                        'typeOfGood.id': {
                            $exists: true,
                            $in: typeOfGood.ids
                        }
                    });
                }
                break;
            default:
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
                ownedThrough: { $gt: params.ownedFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.ownedThrough instanceof Date) {
            andConditions.push({
                ownedFrom: { $lt: params.ownedThrough }
            });
        }

        return andConditions;
    }
    /**
     * 所有権情報を保管する
     */
    public async save(ownershipInfo: IOwnershipInfo<factory.ownershipInfo.IGoodType>) {
        await this.ownershipInfoModel.create({ ...ownershipInfo, _id: ownershipInfo.id });
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

        return this.ownershipInfoModel.countDocuments({ $and: conditions })
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
            { $and: conditions },
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
