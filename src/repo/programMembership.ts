import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/programMembership';

/**
 * 会員プログラムリポジトリ
 */
export class MongoRepository {
    public readonly programMembershipModel: typeof Model;

    constructor(connection: Connection) {
        this.programMembershipModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.programMembership.ISearchConditions) {
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

    /**
     * 検索する
     */
    public async search(params: factory.programMembership.ISearchConditions): Promise<factory.programMembership.IMembershipService[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        const query = this.programMembershipModel.find(
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
        if ((<any>params).sort !== undefined) {
            query.sort((<any>params).sort);
        }

        // const explainResult = await (<any>query).explain();
        // console.log(explainResult[0].executionStats.allPlansExecution.map((e: any) => e.executionStages.inputStage));

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    public async findById(
        conditions: {
            id: string;
        },
        projection?: any
    ): Promise<factory.programMembership.IMembershipService> {
        const doc = await this.programMembershipModel.findOne(
            {
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
            throw new factory.errors.NotFound(this.programMembershipModel.modelName);
        }

        return doc.toObject();
    }
}
