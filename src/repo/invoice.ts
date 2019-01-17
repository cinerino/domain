import * as createDebug from 'debug';
import { Connection } from 'mongoose';

import * as factory from '../factory';
import InvoiceModel from './mongoose/model/invoice';

const debug = createDebug('cinerino-domain:repository');

/**
 * 請求書リポジトリー
 */
export class MongoRepository {
    public readonly invoiceModel: typeof InvoiceModel;

    constructor(connection: Connection) {
        this.invoiceModel = connection.model(InvoiceModel.modelName);
    }

    // tslint:disable-next-line:max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.invoice.ISearchConditions) {
        const andConditions: any[] = [
        ];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.accountIds)) {
            andConditions.push({
                accountId: {
                    $exists: true,
                    $in: params.accountIds
                }
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
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.customer.telephone !== undefined) {
                andConditions.push({
                    'customer.telephone': {
                        $exists: true,
                        $regex: new RegExp(params.customer.telephone, 'i')
                    }
                });
            }
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.paymentMethodIds)) {
            andConditions.push({
                paymentMethodId: {
                    $exists: true,
                    $in: params.paymentMethodIds
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.paymentMethods)) {
            andConditions.push({
                paymentMethod: {
                    $exists: true,
                    $in: params.paymentMethods
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.paymentStatuses)) {
            andConditions.push({
                paymentStatuse: {
                    $exists: true,
                    $in: params.paymentStatuses
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.referencesOrder !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.referencesOrder.orderNumbers)) {
                andConditions.push({
                    'referencesOrder.orderNumber': {
                        $exists: true,
                        $in: params.referencesOrder.orderNumbers
                    }
                });
            }
        }

        return andConditions;
    }

    /**
     * なければ作成する
     */
    public async createIfNotExist(params: factory.invoice.IInvoice) {
        await this.invoiceModel.findOneAndUpdate(
            {
                paymentMethod: params.paymentMethod,
                paymentMethodId: params.paymentMethodId,
                'referencesOrder.orderNumber': params.referencesOrder.orderNumber
            },
            { $setOnInsert: params },
            { upsert: true }
        )
            .exec();
    }

    public async changePaymentStatus(params: {
        referencesOrder: { orderNumber: string };
        paymentMethod: factory.paymentMethodType;
        paymentMethodId: string;
        paymentStatus: factory.paymentStatusType;
    }) {
        const doc = await this.invoiceModel.findOneAndUpdate(
            {
                paymentMethod: params.paymentMethod,
                paymentMethodId: params.paymentMethodId,
                'referencesOrder.orderNumber': params.referencesOrder.orderNumber
            },
            { paymentStatus: params.paymentStatus }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Order');
        }
    }

    public async count(params: factory.invoice.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.invoiceModel.countDocuments(
            { $and: conditions }
        )
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    public async search(params: factory.invoice.ISearchConditions): Promise<factory.invoice.IInvoice[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        debug('searching orders...', conditions);
        const query = this.invoiceModel.find(
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
            query.limit(params.limit)
                .skip(params.limit * (params.page - 1));
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
