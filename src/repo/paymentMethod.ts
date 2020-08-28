import { Connection, Model } from 'mongoose';

import * as factory from '../factory';

import { modelName } from './mongoose/model/paymentMethod';

/**
 * 決済方法リポジトリ
 */
export class MongoRepository {
    public readonly paymentMethodModel: typeof Model;

    constructor(connection: Connection) {
        this.paymentMethodModel = connection.model(modelName);
    }

    public static CREATE_MONGO_CONDITIONS(
        params: factory.chevre.paymentMethod.ISearchConditions
    ) {
        const andConditions: any[] = [];

        const projectIdEq = params.project?.id?.$eq;
        if (typeof projectIdEq === 'string') {
            andConditions.push({
                'project.id': {
                    $exists: true,
                    $eq: projectIdEq
                }
            });
        }

        const typeOfEq = params.typeOf?.$eq;
        if (typeof typeOfEq === 'string') {
            andConditions.push({
                typeOf: {
                    $eq: typeOfEq
                }
            });
        }

        const identifierIn = params.identifier?.$in;
        if (Array.isArray(identifierIn)) {
            andConditions.push({
                identifier: {
                    $exists: true,
                    $in: identifierIn
                }
            });
        }

        const identifierEq = params.identifier?.$eq;
        if (typeof identifierEq === 'string') {
            andConditions.push({
                identifier: {
                    $exists: true,
                    $eq: identifierEq
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.serviceTypes)) {
            andConditions.push({
                serviceType: {
                    $exists: true,
                    $in: params.serviceTypes
                }
            });
        }

        return andConditions;
    }

    public async count(
        params: factory.chevre.paymentMethod.ISearchConditions
    ): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.paymentMethodModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    public async search(
        params: factory.chevre.paymentMethod.ISearchConditions
    ): Promise<factory.chevre.paymentMethod.IPaymentMethod<any>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.paymentMethodModel.find(
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
