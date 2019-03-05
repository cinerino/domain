import { Connection, Model } from 'mongoose';

import { modelName } from './mongoose/model/telemetry';

/**
 * 測定リポジトリ
 */
export class MongoRepository {
    public readonly telemetryModel: typeof Model;

    constructor(connection: Connection) {
        this.telemetryModel = connection.model(modelName);
    }
}
