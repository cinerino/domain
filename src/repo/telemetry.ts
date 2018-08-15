import { Connection } from 'mongoose';
import telemetryModel from './mongoose/model/telemetry';

/**
 * 測定リポジトリー
 */
export class MongoRepository {
    public readonly telemetryModel: typeof telemetryModel;

    constructor(connection: Connection) {
        this.telemetryModel = connection.model(telemetryModel.modelName);
    }
}
