import * as factory from '@cinerino/factory';
import { Connection } from 'mongoose';
import ownershipInfoModel from './mongoose/model/ownershipInfo';

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
    /**
     * 所有権情報を保管する
     */
    public async save(ownershipInfo: IOwnershipInfo<factory.ownershipInfo.IGoodType>) {
        await this.ownershipInfoModel.findOneAndUpdate(
            {
                identifier: ownershipInfo.identifier
            },
            ownershipInfo,
            { upsert: true }
        ).exec();
    }
    /**
     * 所有権を検索する
     */
    public async search<T extends factory.ownershipInfo.IGoodType>(
        searchConditions: factory.ownershipInfo.ISearchConditions<T>
    ): Promise<IOwnershipInfo<T>[]> {
        const andConditions: any[] = [
            { 'typeOfGood.typeOf': searchConditions.goodType }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.identifier !== undefined) {
            andConditions.push({ identifier: searchConditions.identifier });
        }

        // 誰の所有か
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.ownedBy !== undefined) {
            andConditions.push({
                'ownedBy.id': {
                    $exists: true,
                    $eq: searchConditions.ownedBy
                }
            });
        }

        // いつの時点での所有か
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.ownedAt instanceof Date) {
            andConditions.push({
                ownedFrom: { $lte: searchConditions.ownedAt },
                ownedThrough: { $gte: searchConditions.ownedAt }
            });
        }

        return this.ownershipInfoModel.find({ $and: andConditions })
            .sort({ ownedFrom: 1 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
