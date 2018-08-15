import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';
import { Connection } from 'mongoose';
import programMembershipModel from './mongoose/model/programMembership';

const debug = createDebug('cinerino-domain:*');

/**
 * 会員プログラムリポジトリー
 */
export class MongoRepository {
    public readonly programMembershipModel: typeof programMembershipModel;

    constructor(connection: Connection) {
        this.programMembershipModel = connection.model(programMembershipModel.modelName);
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

        debug('searching programMemberships...', andConditions);

        return this.programMembershipModel.find({ $and: andConditions })
            .sort({ programName: 1 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
