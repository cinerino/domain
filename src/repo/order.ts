import { Connection } from 'mongoose';

import * as factory from '../factory';
import OrderModel from './mongoose/model/order';

/**
 * 注文リポジトリー
 */
export class MongoRepository {
    public readonly orderModel: typeof OrderModel;
    constructor(connection: Connection) {
        this.orderModel = connection.model(OrderModel.modelName);
    }
    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.order.ISearchConditions) {
        const andConditions: any[] = [
            // 注文日時の範囲条件
            {
                orderDate: {
                    $exists: true,
                    $gte: params.orderDateFrom,
                    $lte: params.orderDateThrough
                }
            }
        ];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.seller !== undefined) {
            andConditions.push({
                'seller.typeOf': {
                    $exists: true,
                    $eq: params.seller.typeOf
                }
            });
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.seller.ids)) {
                andConditions.push({
                    'seller.id': {
                        $exists: true,
                        $in: params.seller.ids
                    }
                });
            }
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.customer !== undefined) {
            andConditions.push({
                'customer.typeOf': {
                    $exists: true,
                    $eq: params.customer.typeOf
                }
            });
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.customer.ids)) {
                andConditions.push({
                    'customer.id': {
                        $exists: true,
                        $in: params.customer.ids
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.customer.identifiers)) {
                andConditions.push({
                    'customer.identifier': {
                        $exists: true,
                        $in: params.customer.identifiers
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.customer.membershipNumbers)) {
                andConditions.push({
                    'customer.memberOf.membershipNumber': {
                        $exists: true,
                        $in: params.customer.membershipNumbers
                    }
                });
            }
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.orderNumbers)) {
            andConditions.push({
                orderNumber: { $in: params.orderNumbers }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.orderStatuses)) {
            andConditions.push({
                orderStatus: { $in: params.orderStatuses }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.confirmationNumbers)) {
            andConditions.push({
                confirmationNumber: {
                    $exists: true,
                    $in: params.confirmationNumbers
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.reservedEventIds)) {
            andConditions.push({
                'acceptedOffers.itemOffered.reservationFor.id': {
                    $exists: true,
                    $in: params.reservedEventIds
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.paymentMethods !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.paymentMethods.typeOfs)) {
                andConditions.push({
                    'paymentMethods.typeOf': {
                        $exists: true,
                        $in: params.paymentMethods.typeOfs
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.paymentMethods.paymentMethodIds)) {
                andConditions.push({
                    'paymentMethods.paymentMethodId': {
                        $exists: true,
                        $in: params.paymentMethods.paymentMethodIds
                    }
                });
            }
        }

        return andConditions;
    }
    /**
     * 確認番号で検索
     * 確認番号と購入者情報より、最新の注文を検索します
     */
    public async findByConfirmationNumber(params: {
        confirmationNumber: number;
        customer: {
            email?: string;
            telephone?: string;
        };
    }): Promise<factory.order.IOrder> {
        const conditions: any = {
            confirmationNumber: params.confirmationNumber
        };
        if (params.customer.email !== undefined) {
            conditions['customer.email'] = {
                $exists: true,
                $eq: params.customer.email
            };
        }
        if (params.customer.telephone !== undefined) {
            conditions['customer.telephone'] = {
                $exists: true,
                $eq: params.customer.telephone
            };
        }
        const doc = await this.orderModel.findOne(
            conditions,
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        ).sort({ orderDate: -1 }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Order');
        }

        return doc.toObject();
    }
    /**
     * なければ作成する
     * @param order 注文
     */
    public async createIfNotExist(order: factory.order.IOrder) {
        await this.orderModel.findOneAndUpdate(
            { orderNumber: order.orderNumber },
            { $setOnInsert: order },
            { upsert: true }
        ).exec();
    }
    /**
     * 注文ステータスを変更する
     * @param orderNumber 注文番号
     * @param orderStatus 注文ステータス
     */
    public async changeStatus(orderNumber: string, orderStatus: factory.orderStatus) {
        const doc = await this.orderModel.findOneAndUpdate(
            { orderNumber: orderNumber },
            { orderStatus: orderStatus }
        ).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Order');
        }
    }
    /**
     * 注文番号から注文を取得する
     * @param orderNumber 注文番号
     */
    public async findByOrderNumber(orderNumber: string): Promise<factory.order.IOrder> {
        const doc = await this.orderModel.findOne(
            { orderNumber: orderNumber },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        ).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Order');
        }

        return doc.toObject();
    }
    public async count(params: factory.order.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.orderModel.countDocuments(
            { $and: conditions }
        ).setOptions({ maxTimeMS: 10000 })
            .exec();
    }
    /**
     * 注文を検索する
     */
    public async search(params: factory.order.ISearchConditions): Promise<factory.order.IOrder[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.orderModel.find(
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
