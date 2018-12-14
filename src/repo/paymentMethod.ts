import { Connection } from 'mongoose';

import * as factory from '../factory';
import PaymentMethodModel from './mongoose/model/paymentMethod';

/**
 * 決済方法リポジトリー
 */
export class MongoRepository {
    public readonly paymentMethodModel: typeof PaymentMethodModel;

    constructor(connection: Connection) {
        this.paymentMethodModel = connection.model(PaymentMethodModel.modelName);
    }

    public static CREATE_MOVIE_TICKET_MONGO_CONDITIONS(
        params: factory.paymentMethod.ISearchConditions<factory.paymentMethodType.MovieTicket>
    ) {
        const andConditions: any[] = [
            {
                typeOf: factory.paymentMethodType.MovieTicket
            }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.identifiers)) {
            andConditions.push({
                identifier: {
                    $exists: true,
                    $in: params.identifiers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.serviceTypes)) {
            andConditions.push({
                serviceType: {
                    $exists: true,
                    $in: params.serviceTypes
                }
            });
        }

        return andConditions;
    }

    public async countMovieTickets(
        params: factory.paymentMethod.ISearchConditions<factory.paymentMethodType.MovieTicket>
    ): Promise<number> {
        const conditions = MongoRepository.CREATE_MOVIE_TICKET_MONGO_CONDITIONS(params);

        return this.paymentMethodModel.countDocuments({ $and: conditions }).setOptions({ maxTimeMS: 10000 }).exec();
    }

    public async searchMovieTickets(
        params: factory.paymentMethod.ISearchConditions<factory.paymentMethodType.MovieTicket>
    ): Promise<factory.paymentMethod.paymentCard.movieTicket.IMovieTicket[]> {
        const conditions = MongoRepository.CREATE_MOVIE_TICKET_MONGO_CONDITIONS(params);
        const query = this.paymentMethodModel.find(
            { $and: conditions },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        );
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.limit !== undefined && params.page !== undefined) {
            query.limit(params.limit).skip(params.limit * (params.page - 1));
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.setOptions({ maxTimeMS: 10000 }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    }
}
