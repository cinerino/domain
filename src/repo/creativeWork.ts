import * as factory from '@cinerino/factory';
import { Connection } from 'mongoose';
import creativeWorkModel from './mongoose/model/creativeWork';

/**
 * 作品抽象リポジトリー
 */
export abstract class Repository {
    public abstract async saveMovie(movie: factory.creativeWork.movie.ICreativeWork): Promise<void>;
}

/**
 * 作品リポジトリー
 */
export class MongoRepository implements Repository {
    public readonly creativeWorkModel: typeof creativeWorkModel;

    constructor(connection: Connection) {
        this.creativeWorkModel = connection.model(creativeWorkModel.modelName);
    }

    /**
     * save a movie
     * 映画作品を保管する
     * @param movie movie object
     */
    public async saveMovie(movie: factory.creativeWork.movie.ICreativeWork) {
        await this.creativeWorkModel.findOneAndUpdate(
            {
                identifier: movie.identifier,
                typeOf: factory.creativeWorkType.Movie
            },
            movie,
            { upsert: true }
        ).exec();
    }
}
