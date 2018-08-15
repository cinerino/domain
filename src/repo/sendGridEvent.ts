import { Connection } from 'mongoose';
import SendGridEventModel from './mongoose/model/sendGridEvent';

/**
 * SendGridイベントリポジトリー
 */
export class MongoRepository {
    public readonly sendGridEventModel: typeof SendGridEventModel;

    constructor(connection: Connection) {
        this.sendGridEventModel = connection.model(SendGridEventModel.modelName);
    }
}
