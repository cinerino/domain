import { Connection, Model } from 'mongoose';
import { modelName } from './mongoose/model/project';

import * as factory from '../factory';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

const USE_CHEVRE_SEARCH_PROJECT = process.env.USE_CHEVRE_SEARCH_PROJECT === '1';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const projectService = new chevre.service.Project({
    endpoint: credentials.chevre.endpoint,
    auth: chevreAuthClient
});

/**
 * プロジェクトリポジトリ
 */
export class MongoRepository {
    public readonly projectModel: typeof Model;

    constructor(connection: Connection) {
        this.projectModel = connection.model(modelName);
    }

    public static CREATE_MONGO_CONDITIONS(params: factory.project.ISearchConditions) {
        // MongoDB検索条件
        const andConditions: any[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.ids)) {
            andConditions.push({
                _id: { $in: params.ids }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.name !== undefined) {
            andConditions.push({
                $or: [
                    {
                        alternateName: {
                            $exists: true,
                            $regex: new RegExp(params.name)
                        }
                    },
                    {
                        name: {
                            $exists: true,
                            $regex: new RegExp(params.name)
                        }
                    }
                ]
            });
        }

        return andConditions;
    }

    public async findById(
        conditions: {
            id: string;
        },
        projection?: any
    ): Promise<factory.project.IProject> {
        if (USE_CHEVRE_SEARCH_PROJECT) {
            return <any>projectService.findById({
                id: conditions.id,
                ...(projection !== undefined && projection !== null) ? { $projection: projection } : undefined
            });
        }

        const doc = await this.projectModel.findOne(
            { _id: conditions.id },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0,
                ...projection
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.projectModel.modelName);
        }

        return doc.toObject();
    }

    public async count(params: factory.project.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.projectModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * プロジェクト検索
     */
    public async search(
        conditions: factory.project.ISearchConditions,
        projection?: any
    ): Promise<factory.project.IProject[]> {
        const andConditions = MongoRepository.CREATE_MONGO_CONDITIONS(conditions);

        const query = this.projectModel.find(
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
}
