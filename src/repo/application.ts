import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/application';

export interface IApplication {
    typeOf: string;
    id: string;
}

/**
 * アプリケーションリポジトリ
 */
export class MongoRepository {
    public readonly applicationModel: typeof Model;

    constructor(connection: Connection) {
        this.applicationModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: any) {
        const andConditions: any[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.id !== undefined && params.id !== null) {
            if (typeof params.id.$eq === 'string') {
                andConditions.push({
                    _id: {
                        $eq: params.id.$eq
                    }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.project !== undefined && params.project !== null) {
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

        return andConditions;
    }

    public async count(params: any): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.applicationModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    public async search(
        params: any
    ): Promise<IApplication[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.applicationModel.find(
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

        // const explainResult = await (<any>query).explain();
        // console.log(explainResult[0].executionStats.allPlansExecution.map((e: any) => e.executionStages.inputStage));

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    public async findById(params: {
        id: string;
    }): Promise<IApplication> {
        const doc = await this.applicationModel.findOne(
            {
                _id: params.id
            }
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.applicationModel.modelName);
        }

        return doc.toObject();
    }
}
