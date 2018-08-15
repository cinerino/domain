import * as factory from '@cinerino/factory';
import { Connection } from 'mongoose';
import OrderModel from './mongoose/model/order';

/**
 * 注文リポジトリー
 */
export class MongoRepository {
    public readonly orderModel: typeof OrderModel;

    constructor(connection: Connection) {
        this.orderModel = connection.model(OrderModel.modelName);
    }

    /**
     * find an order by an inquiry key
     */
    public async findByOrderInquiryKey(orderInquiryKey: factory.order.IOrderInquiryKey) {
        const doc = await this.orderModel.findOne(
            {
                'orderInquiryKey.theaterCode': orderInquiryKey.theaterCode,
                'orderInquiryKey.confirmationNumber': orderInquiryKey.confirmationNumber,
                'orderInquiryKey.telephone': orderInquiryKey.telephone
            }
        ).exec();

        if (doc === null) {
            throw new factory.errors.NotFound('order');
        }

        return <factory.order.IOrder>doc.toObject();
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
            throw new factory.errors.NotFound('order');
        }
    }

    /**
     * 注文番号から注文を取得する
     * @param orderNumber 注文番号
     */
    public async findByOrderNumber(orderNumber: string): Promise<factory.order.IOrder> {
        const doc = await this.orderModel.findOne(
            { orderNumber: orderNumber }
        ).exec();

        if (doc === null) {
            throw new factory.errors.NotFound('order');
        }

        return <factory.order.IOrder>doc.toObject();
    }

    /**
     * 注文を検索する
     * @param searchConditions 検索条件
     */
    public async search(
        searchConditions: factory.order.ISearchConditions
    ): Promise<factory.order.IOrder[]> {
        const andConditions: any[] = [
            // 注文日時の範囲条件
            {
                orderDate: {
                    $exists: true,
                    $gte: searchConditions.orderDateFrom,
                    $lte: searchConditions.orderDateThrough
                }
            }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.sellerIds)) {
            andConditions.push({
                'seller.id': {
                    $exists: true,
                    $in: searchConditions.sellerIds
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.customerMembershipNumbers)) {
            andConditions.push({
                'customer.memberOf.membershipNumber': {
                    $exists: true,
                    $in: searchConditions.customerMembershipNumbers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.orderNumbers)) {
            andConditions.push({
                orderNumber: { $in: searchConditions.orderNumbers }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.orderStatuses)) {
            andConditions.push({
                orderStatus: { $in: searchConditions.orderStatuses }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.confirmationNumbers)) {
            andConditions.push({
                confirmationNumber: {
                    $exists: true,
                    $in: searchConditions.confirmationNumbers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.reservedEventIdentifiers)) {
            andConditions.push({
                'acceptedOffers.itemOffered.reservationFor.identifier': {
                    $exists: true,
                    $in: searchConditions.reservedEventIdentifiers
                }
            });
        }

        return this.orderModel.find({ $and: andConditions })
            .sort({ orderDate: 1 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
