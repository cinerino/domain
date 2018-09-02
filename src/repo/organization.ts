import * as factory from '@cinerino/factory';
import { Connection } from 'mongoose';
import organizationModel from './mongoose/model/organization';

export type IOrganization<T> =
    T extends factory.organizationType.Corporation ? factory.organization.corporation.IOrganization :
    T extends factory.organizationType.MovieTheater ? factory.organization.movieTheater.IOrganization :
    factory.organization.IOrganization;
/**
 * 組織リポジトリー
 */
export class MongoRepository {
    public readonly organizationModel: typeof organizationModel;
    constructor(connection: Connection) {
        this.organizationModel = connection.model(organizationModel.modelName);
    }
    public static CREATE_MOVIE_THEATER_MONGO_CONDITIONS(params: factory.organization.movieTheater.ISearchConditions) {
        // MongoDB検索条件
        const andConditions: any[] = [
            {
                typeOf: factory.organizationType.MovieTheater
            }
        ];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.name !== undefined) {
            andConditions.push({
                $or: [
                    { 'name.ja': new RegExp(params.name, 'i') },
                    { 'name.en': new RegExp(params.name, 'i') }
                ]
            });
        }

        return andConditions;
    }
    /**
     * IDで組織を取得する
     */
    public async findById<T extends factory.organizationType>(params: {
        typeOf: T;
        id: string;
    }): Promise<IOrganization<T>> {
        const doc = await this.organizationModel.findOne({
            typeOf: params.typeOf,
            _id: params.id
        }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Organization');
        }

        return doc.toObject();
    }
    public async countMovieTheaters(params: factory.organization.movieTheater.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MOVIE_THEATER_MONGO_CONDITIONS(params);

        return this.organizationModel.countDocuments(
            { $and: conditions }
        ).setOptions({ maxTimeMS: 10000 })
            .exec();
    }
    /**
     * 劇場検索
     */
    public async searchMovieTheaters(
        params: factory.organization.movieTheater.ISearchConditions
    ): Promise<factory.organization.movieTheater.IOrganization[]> {
        const conditions = MongoRepository.CREATE_MOVIE_THEATER_MONGO_CONDITIONS(params);
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
            query.limit(params.limit).skip(params.limit * (params.page - 1));
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.setOptions({ maxTimeMS: 10000 }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    }
}
