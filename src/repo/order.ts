import { Connection, Document, Model, QueryCursor } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/order';

import { MongoErrorCode } from '../errorHandler';

/**
 * 注文リポジトリ
 */
export class MongoRepository {
    public readonly orderModel: typeof Model;

    constructor(connection: Connection) {
        this.orderModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.order.ISearchConditions) {
        const andConditions: any[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.project !== undefined) {
            if (Array.isArray(params.project.ids)) {
                andConditions.push({
                    'project.id': {
                        $exists: true,
                        $in: params.project.ids
                    }
                });
            }

            if (params.project.id !== undefined && params.project.id !== null) {
                if (typeof params.project.id.$eq === 'string') {
                    andConditions.push({
                        'project.id': {
                            $exists: true,
                            $eq: params.project.id.$eq
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.identifier !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.identifier.$all)) {
                andConditions.push({
                    identifier: {
                        $exists: true,
                        $all: params.identifier.$all
                    }
                });
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.identifier.$in)) {
                andConditions.push({
                    identifier: {
                        $exists: true,
                        $in: params.identifier.$in
                    }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.seller !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.seller.typeOf !== undefined) {
                andConditions.push({
                    'seller.typeOf': {
                        $exists: true,
                        $eq: params.seller.typeOf
                    }
                });
            }
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
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.customer.typeOf !== undefined) {
                andConditions.push({
                    'customer.typeOf': {
                        $exists: true,
                        $eq: params.customer.typeOf
                    }
                });
            }
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
            if (params.customer.identifier !== undefined) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(params.customer.identifier.$all)) {
                    andConditions.push({
                        'customer.identifier': {
                            $exists: true,
                            $all: params.customer.identifier.$all
                        }
                    });
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(params.customer.identifier.$in)) {
                    andConditions.push({
                        'customer.identifier': {
                            $exists: true,
                            $in: params.customer.identifier.$in
                        }
                    });
                }
            }

            if (params.customer.additionalProperty !== undefined && params.customer.additionalProperty !== null) {
                if (Array.isArray(params.customer.additionalProperty.$all)) {
                    andConditions.push({
                        'customer.additionalProperty': {
                            $exists: true,
                            $all: params.customer.additionalProperty.$all
                        }
                    });
                }

                if (Array.isArray(params.customer.additionalProperty.$in)) {
                    andConditions.push({
                        'customer.additionalProperty': {
                            $exists: true,
                            $in: params.customer.additionalProperty.$in
                        }
                    });
                }
            }

            if (params.customer.memberOf !== undefined && params.customer.memberOf !== null) {
                if (params.customer.memberOf.membershipNumber !== undefined && params.customer.memberOf.membershipNumber !== null) {
                    if (typeof params.customer.memberOf.membershipNumber.$eq === 'string') {
                        andConditions.push({
                            'customer.memberOf.membershipNumber': {
                                $exists: true,
                                $eq: params.customer.memberOf.membershipNumber.$eq
                            }
                        });
                    }

                    if (Array.isArray(params.customer.memberOf.membershipNumber.$in)) {
                        andConditions.push({
                            'customer.memberOf.membershipNumber': {
                                $exists: true,
                                $in: params.customer.memberOf.membershipNumber.$in
                            }
                        });
                    }
                }
            }

            if (typeof params.customer.givenName === 'string') {
                andConditions.push({
                    'customer.givenName': {
                        $exists: true,
                        $regex: new RegExp(params.customer.givenName)
                    }
                });
            } else if (params.customer.givenName !== undefined && params.customer.givenName !== null) {
                if (typeof params.customer.givenName.$eq === 'string') {
                    andConditions.push({
                        'customer.givenName': {
                            $exists: true,
                            $eq: params.customer.givenName.$eq
                        }
                    });
                }

                if (typeof params.customer.givenName.$regex === 'string') {
                    andConditions.push({
                        'customer.givenName': {
                            $exists: true,
                            $regex: new RegExp(params.customer.givenName.$regex)
                        }
                    });
                }
            }

            if (typeof params.customer.familyName === 'string') {
                andConditions.push({
                    'customer.familyName': {
                        $exists: true,
                        $regex: new RegExp(params.customer.familyName)
                    }
                });
            } else if (params.customer.familyName !== undefined && params.customer.familyName !== null) {
                if (typeof params.customer.familyName.$eq === 'string') {
                    andConditions.push({
                        'customer.familyName': {
                            $exists: true,
                            $eq: params.customer.familyName.$eq
                        }
                    });
                }

                if (typeof params.customer.familyName.$regex === 'string') {
                    andConditions.push({
                        'customer.familyName': {
                            $exists: true,
                            $regex: new RegExp(params.customer.familyName.$regex)
                        }
                    });
                }
            }

            if (typeof params.customer.email === 'string') {
                andConditions.push({
                    'customer.email': {
                        $exists: true,
                        $regex: new RegExp(params.customer.email)
                    }
                });
            } else if (params.customer.email !== undefined && params.customer.email !== null) {
                if (typeof params.customer.email.$eq === 'string') {
                    andConditions.push({
                        'customer.email': {
                            $exists: true,
                            $eq: params.customer.email.$eq
                        }
                    });
                }

                if (typeof params.customer.email.$regex === 'string') {
                    andConditions.push({
                        'customer.email': {
                            $exists: true,
                            $regex: new RegExp(params.customer.email.$regex)
                        }
                    });
                }
            }

            if (typeof params.customer.telephone === 'string') {
                andConditions.push({
                    'customer.telephone': {
                        $exists: true,
                        $regex: new RegExp(params.customer.telephone)
                    }
                });
            } else if (params.customer.telephone !== undefined && params.customer.telephone !== null) {
                if (typeof params.customer.telephone.$eq === 'string') {
                    andConditions.push({
                        'customer.telephone': {
                            $exists: true,
                            $eq: params.customer.telephone.$eq
                        }
                    });
                }

                if (typeof params.customer.telephone.$regex === 'string') {
                    andConditions.push({
                        'customer.telephone': {
                            $exists: true,
                            $regex: new RegExp(params.customer.telephone.$regex)
                        }
                    });
                }
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

        const itemOfferedIdentifierIn = params.acceptedOffers?.itemOffered?.identifier?.$in;
        if (Array.isArray(itemOfferedIdentifierIn)) {
            andConditions.push({
                'acceptedOffers.itemOffered.identifier': {
                    $exists: true,
                    $in: itemOfferedIdentifierIn
                }
            });
        }

        const itemOfferedTypeOfIn = params.acceptedOffers?.itemOffered?.typeOf?.$in;
        if (Array.isArray(itemOfferedTypeOfIn)) {
            andConditions.push({
                'acceptedOffers.itemOffered.typeOf': {
                    $exists: true,
                    $in: itemOfferedTypeOfIn
                }
            });
        }

        const itemOfferedIssuedThroughIdIn = params.acceptedOffers?.itemOffered?.issuedThrough?.id?.$in;
        if (Array.isArray(itemOfferedIssuedThroughIdIn)) {
            andConditions.push({
                'acceptedOffers.itemOffered.issuedThrough.id': {
                    $exists: true,
                    $in: itemOfferedIssuedThroughIdIn
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.acceptedOffers !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.acceptedOffers.itemOffered !== undefined) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(params.acceptedOffers.itemOffered.ids)) {
                    andConditions.push({
                        'acceptedOffers.itemOffered.id': {
                            $exists: true,
                            $in: params.acceptedOffers.itemOffered.ids
                        }
                    });
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (Array.isArray(params.acceptedOffers.itemOffered.reservationNumbers)) {
                    andConditions.push({
                        'acceptedOffers.itemOffered.reservationNumber': {
                            $exists: true,
                            $in: params.acceptedOffers.itemOffered.reservationNumbers
                        }
                    });
                }

                const reservationForConditions = params.acceptedOffers.itemOffered.reservationFor;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (reservationForConditions !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(reservationForConditions.ids)) {
                        andConditions.push({
                            'acceptedOffers.itemOffered.reservationFor.id': {
                                $exists: true,
                                $in: reservationForConditions.ids
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.name !== undefined) {
                        andConditions.push({
                            $or: [
                                {
                                    'acceptedOffers.itemOffered.reservationFor.name.ja': {
                                        $exists: true,
                                        $regex: new RegExp(reservationForConditions.name)
                                    }
                                },
                                {
                                    'acceptedOffers.itemOffered.reservationFor.name.en': {
                                        $exists: true,
                                        $regex: new RegExp(reservationForConditions.name)
                                    }
                                }
                            ]
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.location !== undefined) {
                        if (Array.isArray(reservationForConditions.location.branchCodes)) {
                            andConditions.push({
                                'acceptedOffers.itemOffered.reservationFor.location.branchCode': {
                                    $exists: true,
                                    $in: reservationForConditions.location.branchCodes
                                }
                            });
                        }
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.superEvent !== undefined) {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else */
                        if (Array.isArray(reservationForConditions.superEvent.ids)) {
                            andConditions.push({
                                'acceptedOffers.itemOffered.reservationFor.superEvent.id': {
                                    $exists: true,
                                    $in: reservationForConditions.superEvent.ids
                                }
                            });
                        }
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else */
                        if (reservationForConditions.superEvent.location !== undefined) {
                            if (Array.isArray(reservationForConditions.superEvent.location.branchCodes)) {
                                andConditions.push({
                                    'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': {
                                        $exists: true,
                                        $in: reservationForConditions.superEvent.location.branchCodes
                                    }
                                });
                            }
                        }
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else */
                        if (reservationForConditions.superEvent.workPerformed !== undefined) {
                            if (Array.isArray(reservationForConditions.superEvent.workPerformed.identifiers)) {
                                andConditions.push({
                                    'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': {
                                        $exists: true,
                                        $in: reservationForConditions.superEvent.workPerformed.identifiers
                                    }
                                });
                            }
                        }
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.inSessionFrom instanceof Date) {
                        andConditions.push({
                            'acceptedOffers.itemOffered.reservationFor.endDate': {
                                $exists: true,
                                $gt: reservationForConditions.inSessionFrom
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.inSessionThrough instanceof Date) {
                        andConditions.push({
                            'acceptedOffers.itemOffered.reservationFor.startDate': {
                                $exists: true,
                                $lt: reservationForConditions.inSessionThrough
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.startFrom instanceof Date) {
                        andConditions.push({
                            'acceptedOffers.itemOffered.reservationFor.startDate': {
                                $exists: true,
                                $gte: reservationForConditions.startFrom
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (reservationForConditions.startThrough instanceof Date) {
                        andConditions.push({
                            'acceptedOffers.itemOffered.reservationFor.startDate': {
                                $exists: true,
                                $lt: reservationForConditions.startThrough
                            }
                        });
                    }
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.paymentMethods !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.paymentMethods.accountIds)) {
                andConditions.push({
                    'paymentMethods.accountId': {
                        $exists: true,
                        $in: params.paymentMethods.accountIds
                    }
                });
            }

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

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.orderDateFrom instanceof Date) {
            andConditions.push({
                orderDate: { $gte: params.orderDateFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.orderDateThrough instanceof Date) {
            andConditions.push({
                orderDate: { $lte: params.orderDateThrough }
            });
        }

        if (params.orderDate !== undefined && params.orderDate !== null) {
            if (params.orderDate.$gte instanceof Date) {
                andConditions.push({
                    orderDate: { $gte: params.orderDate.$gte }
                });
            }

            if (params.orderDate.$lte instanceof Date) {
                andConditions.push({
                    orderDate: { $lte: params.orderDate.$lte }
                });
            }
        }

        if ((<any>params).price !== undefined && (<any>params).price !== null) {
            if (typeof (<any>params).price.$gte === 'number') {
                andConditions.push({
                    price: {
                        $exists: true,
                        $gte: (<any>params).price.$gte
                    }
                });
            }

            if (typeof (<any>params).price.$lte === 'number') {
                andConditions.push({
                    price: {
                        $exists: true,
                        $lte: (<any>params).price.$lte
                    }
                });
            }
        }

        return andConditions;
    }

    /**
     * なければ作成する
     */
    public async createIfNotExist(order: factory.order.IOrder) {
        try {
            await this.orderModel.findOneAndUpdate(
                { orderNumber: order.orderNumber },
                { $setOnInsert: order },
                { new: true, upsert: true }
            )
                .exec();
        } catch (error) {
            let throwsError = true;

            if (error.name === 'MongoError') {
                // すでにorderNumberが存在する場合ok
                if (error.code === MongoErrorCode.DuplicateKey) {
                    throwsError = false;
                }
            }

            if (throwsError) {
                throw error;
            }
        }
    }

    /**
     * 注文ステータスを変更する
     */
    public async changeStatus(params: {
        orderNumber: string;
        orderStatus: factory.orderStatus;
        previousOrderStatus: factory.orderStatus;
    }): Promise<factory.order.IOrder> {
        const doc = await this.orderModel.findOneAndUpdate(
            {
                orderNumber: params.orderNumber,
                orderStatus: params.previousOrderStatus
            },
            { orderStatus: params.orderStatus },
            {
                new: true,
                projection: {
                    __v: 0,
                    createdAt: 0,
                    updatedAt: 0
                }
            }
        )
            .exec();

        // NotFoundであれば状態確認
        if (doc === null) {
            const order = await this.findByOrderNumber(params);
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (order.orderStatus === params.orderStatus) {
                // すでに変更済の場合
                return order;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
            } else {
                throw new factory.errors.Argument(
                    'orderNumber',
                    `Order ${order.orderNumber} already changed -> ${order.orderStatus}`
                );
            }
        }

        return doc.toObject();
    }

    /**
     * 注文を返品する
     */
    public async returnOrder(params: {
        orderNumber: string;
        dateReturned: Date;
        returner: factory.order.IReturner;
    }): Promise<factory.order.IOrder> {
        const doc = await this.orderModel.findOneAndUpdate(
            {
                orderNumber: params.orderNumber,
                orderStatus: factory.orderStatus.OrderDelivered
            },
            {
                orderStatus: factory.orderStatus.OrderReturned,
                dateReturned: params.dateReturned,
                returner: params.returner
            },
            {
                new: true,
                projection: {
                    __v: 0,
                    createdAt: 0,
                    updatedAt: 0
                }
            }
        )
            .exec();

        // NotFoundであれば状態確認
        if (doc === null) {
            const order = await this.findByOrderNumber(params);
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (order.orderStatus === factory.orderStatus.OrderReturned) {
                // すでに変更済の場合
                return order;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
            } else {
                throw new factory.errors.Argument(
                    'orderNumber',
                    `Order ${order.orderNumber} already changed -> ${order.orderStatus}`
                );
            }
        }

        return doc.toObject();
    }

    /**
     * 注文番号から注文を取得する
     */
    public async findByOrderNumber(params: { orderNumber: string }): Promise<factory.order.IOrder> {
        const doc = await this.orderModel.findOne(
            { orderNumber: params.orderNumber },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.orderModel.modelName);
        }

        return doc.toObject();
    }

    public async count(params: factory.order.ISearchConditions): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.orderModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 注文を検索する
     */
    public async search(params: factory.order.ISearchConditions): Promise<factory.order.IOrder[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.orderModel.find((conditions.length > 0) ? { $and: conditions } : {})
            .select({ __v: 0, createdAt: 0, updatedAt: 0 });
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

        // const explainResult = await (<any>query).explain();
        // console.log(explainResult[0].executionStats.allPlansExecution.map((e: any) => e.executionStages.inputStage));

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    public stream(params: factory.order.ISearchConditions): QueryCursor<Document> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.orderModel.find((conditions.length > 0) ? { $and: conditions } : {})
            .select({ __v: 0, createdAt: 0, updatedAt: 0 });

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

        return query.cursor();
    }
}
