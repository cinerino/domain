import { Connection, Model } from 'mongoose';
import { modelName } from './mongoose/model/project';

import * as factory from '../factory';

export interface ISettings {
    chevre: {
        endpoint: string;
    };
    coa: {
        endpoint: string;
        refreshToken: string;
    };
    gmo: {
        endpoint: string;
        siteId: string;
        sitePass: string;
    };
    mvtkReserve: {
        endpoint: string;
    };
    pecorino: {
        endpoint: string;
    };
    waiter: {
        disabled: boolean;
        endpoint: string;
        secret: string;
    };
    lineNotify: {
        accessToken: string;
        endpoint: string;
    };
}

export interface IProject {
    typeOf: 'Project';
    id: string;
    settings: ISettings;
}

/**
 * プロジェクトリポジトリ
 */
export class MongoRepository {
    public readonly projectModel: typeof Model;

    constructor(connection: Connection) {
        this.projectModel = connection.model(modelName);
    }

    public async findById(
        conditions: {
            id: string;
        },
        projection?: any
    ): Promise<IProject> {
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
}
