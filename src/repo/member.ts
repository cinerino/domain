import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/member';

export enum RoleType {
    OrganizationRole = 'OrganizationRole'
}
export interface IRole {
    typeOf: RoleType;
    roleName: string;
    memberOf: { typeOf: factory.organizationType.Project; id: string };
}
export interface IMember {
    typeOf: RoleType;
    project: { typeOf: factory.organizationType.Project; id: string };
    member: {
        typeOf: factory.personType;
        id: string;
        username: string;
        hasRole: IRole[];
    };
}

/**
 * プロジェクトメンバーリポジトリ
 */
export class MongoRepository {
    public readonly memberModel: typeof Model;

    constructor(connection: Connection) {
        this.memberModel = connection.model(modelName);
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
                            $eq: params.project.id.$eq
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.member !== undefined && params.member !== null) {
            if (params.member.typeOf !== undefined && params.member.typeOf !== null) {
                if (typeof params.member.typeOf.$eq === 'string') {
                    andConditions.push({
                        'member.typeOf': {
                            $exists: true,
                            $eq: params.member.typeOf.$eq
                        }
                    });
                }
            }

            if (params.member.id !== undefined && params.member.id !== null) {
                if (typeof params.member.id.$eq === 'string') {
                    andConditions.push({
                        'member.id': {
                            $eq: params.member.id.$eq
                        }
                    });
                }
            }
        }

        const memberIdIn = params.member?.id?.$in;
        if (Array.isArray(memberIdIn)) {
            andConditions.push({
                'member.id': {
                    $in: memberIdIn
                }
            });
        }

        const memberNameRegex = params.member?.name?.$regex;
        if (typeof memberNameRegex === 'string') {
            andConditions.push({
                'member.name': {
                    $exists: true,
                    $regex: new RegExp(memberNameRegex)
                }
            });
        }

        return andConditions;
    }

    public async count(params: any): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.memberModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    public async search(
        params: any
    ): Promise<IMember[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.memberModel.find(
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
    }): Promise<IMember> {
        const doc = await this.memberModel.findOne(
            {
                _id: params.id
            }
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.memberModel.modelName);
        }

        return doc.toObject();
    }
}
