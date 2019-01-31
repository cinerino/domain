import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/programMembership';

/**
 * 会員プログラムリポジトリー
 */
export class MongoRepository {
    public readonly programMembershipModel: typeof Model;

    constructor(connection: Connection) {
        this.programMembershipModel = connection.model(modelName);
    }

    /**
     * 検索する
     */
    public async search(params: {
        id?: string;
    }): Promise<factory.programMembership.IProgramMembership[]> {
        const andConditions: any[] = [
            { typeOf: <factory.programMembership.ProgramMembershipType>'ProgramMembership' }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.id !== undefined) {
            andConditions.push({ _id: params.id });
        }

        return this.programMembershipModel.find({ $and: andConditions })
            .sort({ programName: 1 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
