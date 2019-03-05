import * as createDebug from 'debug';
import { Connection, Model } from 'mongoose';

import { modelName } from './mongoose/model/place';

import * as factory from '../factory';

const debug = createDebug('cinerino-domain:repository');

/**
 * 場所リポジトリ
 */
export class MongoRepository {
    public readonly placeModel: typeof Model;

    constructor(connection: Connection) {
        this.placeModel = connection.model(modelName);
    }

    /**
     * 劇場を保管する
     */
    public async saveMovieTheater(movieTheater: factory.chevre.place.movieTheater.IPlace) {
        await this.placeModel.findOneAndUpdate(
            {
                branchCode: movieTheater.branchCode
            },
            movieTheater,
            { upsert: true }
        )
            .exec();
    }

    /**
     * 劇場検索
     */
    public async searchMovieTheaters(
        searchConditions: {}
    ): Promise<factory.chevre.place.movieTheater.IPlaceWithoutScreeningRoom[]> {
        // 検索条件を作成
        const conditions: any = {
            typeOf: factory.chevre.placeType.MovieTheater
        };
        debug('searchConditions:', searchConditions);

        // tslint:disable-next-line:no-suspicious-comment
        // TODO 検索条件を指定できるように改修

        debug('finding places...', conditions);

        // containsPlaceを含めるとデータサイズが大きくなるので、検索結果には含めない
        return this.placeModel.find(
            conditions,
            { containsPlace: 0 }
        )
            .setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => <factory.chevre.place.movieTheater.IPlaceWithoutScreeningRoom>doc.toObject()));
    }

    /**
     * 枝番号で劇場検索
     */
    public async findMovieTheaterByBranchCode(
        branchCode: string
    ): Promise<factory.chevre.place.movieTheater.IPlace> {
        const doc = await this.placeModel.findOne({
            typeOf: factory.chevre.placeType.MovieTheater,
            branchCode: branchCode
        })
            .exec();

        if (doc === null) {
            throw new factory.errors.NotFound('Place');
        }

        return doc.toObject();
    }
}
