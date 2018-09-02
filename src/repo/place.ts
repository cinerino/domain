import * as factory from '@cinerino/factory';
import * as createDebug from 'debug';
import { Connection } from 'mongoose';
import placeModel from './mongoose/model/place';

const debug = createDebug('cinerino-domain:repository');

/**
 * 場所抽象リポジトリー
 */
export abstract class Repository {
    public abstract async saveMovieTheater(movieTheater: factory.chevre.place.movieTheater.IPlace): Promise<void>;
    public abstract async searchMovieTheaters(
        searchConditions: {}
    ): Promise<factory.chevre.place.movieTheater.IPlaceWithoutScreeningRoom[]>;
    public abstract async findMovieTheaterByBranchCode(branchCode: string): Promise<factory.chevre.place.movieTheater.IPlace>;
}

/**
 * 場所リポジトリー
 */
export class MongoRepository {
    public readonly placeModel: typeof placeModel;

    constructor(connection: Connection) {
        this.placeModel = connection.model(placeModel.modelName);
    }

    /**
     * 劇場を保管する
     * @param movieTheater movieTheater object
     */
    public async saveMovieTheater(movieTheater: factory.chevre.place.movieTheater.IPlace) {
        await this.placeModel.findOneAndUpdate(
            {
                branchCode: movieTheater.branchCode
            },
            movieTheater,
            { upsert: true }
        ).exec();
    }

    /**
     * 劇場検索
     * @param searchConditions 検索条件
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
        }).exec();

        if (doc === null) {
            throw new factory.errors.NotFound('movieTheater');
        }

        return <factory.chevre.place.movieTheater.IPlace>doc.toObject();
    }
}
