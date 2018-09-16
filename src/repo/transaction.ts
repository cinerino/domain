import * as moment from 'moment';
import { Connection } from 'mongoose';

import * as factory from '../factory';
import TransactionModel from './mongoose/model/transaction';

/**
 * 取引リポジトリー
 */
export class MongoRepository {
    public readonly transactionModel: typeof TransactionModel;
    constructor(connection: Connection) {
        this.transactionModel = connection.model(TransactionModel.modelName);
    }
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.transaction.ISearchConditions<factory.transactionType>) {
        const andConditions: any[] = [
            {
                typeOf: params.typeOf
            }
        ];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startFrom !== undefined) {
            andConditions.push({
                startDate: { $gt: params.startFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startThrough !== undefined) {
            andConditions.push({
                startDate: { $lt: params.startThrough }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.endFrom !== undefined) {
            andConditions.push({
                endDate: {
                    $exists: true,
                    $gte: params.endFrom
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.endThrough !== undefined) {
            andConditions.push({
                endDate: {
                    $exists: true,
                    $lt: params.endThrough
                }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.ids)) {
            andConditions.push({
                _id: { $in: params.ids }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.statuses)) {
            andConditions.push({
                status: { $in: params.statuses }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.agent !== undefined) {
            if (Array.isArray(params.agent.ids)) {
                andConditions.push({
                    'agent.id': { $in: params.agent.ids }
                });
            }
        }
        switch (params.typeOf) {
            case factory.transactionType.PlaceOrder:
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (params.seller !== undefined) {
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
                if (params.object !== undefined) {
                    if (params.object.customerContact !== undefined) {
                        if (params.object.customerContact.familyName !== undefined) {
                            andConditions.push({
                                'object.customerContact.familyName': {
                                    $exists: true,
                                    $regex: new RegExp(params.object.customerContact.familyName, 'i')
                                }
                            });
                        }
                        if (params.object.customerContact.givenName !== undefined) {
                            andConditions.push({
                                'object.customerContact.givenName': {
                                    $exists: true,
                                    $regex: new RegExp(params.object.customerContact.givenName, 'i')
                                }
                            });
                        }
                        if (params.object.customerContact.email !== undefined) {
                            andConditions.push({
                                'object.customerContact.email': {
                                    $exists: true,
                                    $regex: new RegExp(params.object.customerContact.email, 'i')
                                }
                            });
                        }
                        if (params.object.customerContact.telephone !== undefined) {
                            andConditions.push({
                                'object.customerContact.telephone': {
                                    $exists: true,
                                    $regex: new RegExp(params.object.customerContact.telephone, 'i')
                                }
                            });
                        }
                    }
                }
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (params.result !== undefined) {
                    if (params.result.order !== undefined) {
                        if (Array.isArray(params.result.order.orderNumbers)) {
                            andConditions.push({
                                'result.order.orderNumber': {
                                    $exists: true,
                                    $in: params.result.order.orderNumbers
                                }
                            });
                        }
                    }
                }
                break;
            case factory.transactionType.ReturnOrder:
                break;
            default:

        }

        return andConditions;
    }
    /**
     * 取引を開始する
     */
    public async start<T extends factory.transactionType>(
        typeOf: T,
        attributes: factory.transaction.IAttributes<T>
    ): Promise<factory.transaction.ITransaction<T>> {
        return this.transactionModel.create({
            typeOf: typeOf,
            ...<Object>attributes,
            status: factory.transactionStatusType.InProgress,
            startDate: new Date(),
            endDate: undefined,
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        }).then((doc) => doc.toObject());
    }
    /**
     * IDで取引を取得する
     * @param transactionId 取引ID
     */
    public async findById<T extends factory.transactionType>(
        typeOf: T,
        transactionId: string
    ): Promise<factory.transaction.ITransaction<T>> {
        const doc = await this.transactionModel.findOne({
            _id: transactionId,
            typeOf: typeOf
        }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Transaction');
        }

        return doc.toObject();
    }
    /**
     * 進行中の取引を取得する
     */
    public async findInProgressById<T extends factory.transactionType>(
        typeOf: T,
        transactionId: string
    ): Promise<factory.transaction.ITransaction<T>> {
        const doc = await this.transactionModel.findOne({
            _id: transactionId,
            typeOf: typeOf,
            status: factory.transactionStatusType.InProgress
        }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Transaction');
        }

        return doc.toObject();
    }
    /**
     * 取引中の所有者プロフィールを変更する
     * 匿名所有者として開始した場合のみ想定(匿名か会員に変更可能)
     */
    public async setCustomerContactOnPlaceOrderInProgress(
        transactionId: string,
        contact: factory.transaction.placeOrder.ICustomerContact
    ): Promise<void> {
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                _id: transactionId,
                typeOf: factory.transactionType.PlaceOrder,
                status: factory.transactionStatusType.InProgress
            },
            {
                'object.customerContact': contact
            }
        ).exec();
        if (doc === null) {
            throw new factory.errors.NotFound('Transaction');
        }
    }
    /**
     * 注文取引を確定する
     * @param transactionId transaction id
     * @param authorizeActions authorize actions
     * @param result transaction result
     */
    public async confirmPlaceOrder(
        transactionId: string,
        authorizeActions: factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>>[],
        result: factory.transaction.placeOrder.IResult,
        potentialActions: factory.transaction.placeOrder.IPotentialActions
    ): Promise<factory.transaction.placeOrder.ITransaction> {
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                _id: transactionId,
                typeOf: factory.transactionType.PlaceOrder,
                status: factory.transactionStatusType.InProgress
            },
            {
                status: factory.transactionStatusType.Confirmed, // ステータス変更
                endDate: new Date(),
                'object.authorizeActions': authorizeActions, // 認可アクションリストを更新
                result: result, // resultを更新
                potentialActions: potentialActions // resultを更新
            },
            { new: true }
        ).exec();
        // NotFoundであれば取引状態確認
        if (doc === null) {
            const transaction = await this.findById(factory.transactionType.PlaceOrder, transactionId);
            if (transaction.status === factory.transactionStatusType.Confirmed) {
                // すでに確定済の場合
                return transaction;
            } else if (transaction.status === factory.transactionStatusType.Expired) {
                throw new factory.errors.Argument('transactionId', 'Transaction already expired');
            } else if (transaction.status === factory.transactionStatusType.Canceled) {
                throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
            } else {
                throw new factory.errors.NotFound('Transaction');
            }
        }

        return doc.toObject();
    }
    /**
     * 注文返品取引を確定する
     * @param transactionId transaction id
     * @param result transaction result
     */
    public async confirmReturnOrder(
        transactionId: string,
        result: factory.transaction.returnOrder.IResult,
        potentialActions: factory.transaction.returnOrder.IPotentialActions
    ): Promise<factory.transaction.returnOrder.ITransaction> {
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                _id: transactionId,
                typeOf: factory.transactionType.ReturnOrder,
                status: factory.transactionStatusType.InProgress
            },
            {
                status: factory.transactionStatusType.Confirmed, // ステータス変更
                endDate: new Date(),
                result: result,
                potentialActions: potentialActions
            },
            { new: true }
        ).exec();
        // NotFoundであれば取引状態確認
        if (doc === null) {
            const transaction = await this.findById(factory.transactionType.ReturnOrder, transactionId);
            if (transaction.status === factory.transactionStatusType.Confirmed) {
                // すでに確定済の場合
                return transaction;
            } else if (transaction.status === factory.transactionStatusType.Expired) {
                throw new factory.errors.Argument('transactionId', 'Transaction already expired');
            } else if (transaction.status === factory.transactionStatusType.Canceled) {
                throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
            } else {
                throw new factory.errors.NotFound('Transaction');
            }
        }

        return doc.toObject();
    }
    /**
     * タスク未エクスポートの取引をひとつ取得してエクスポートを開始する
     * @param typeOf 取引タイプ
     * @param status 取引ステータス
     */
    public async startExportTasks<T extends factory.transactionType>(
        typeOf: T,
        status: factory.transactionStatusType
    ): Promise<factory.transaction.ITransaction<T> | null> {
        return this.transactionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                status: status,
                tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
            },
            { tasksExportationStatus: factory.transactionTasksExportationStatus.Exporting },
            { new: true }
        ).exec().then((doc) => (doc === null) ? null : doc.toObject());
    }
    /**
     * タスクエクスポートリトライ
     * todo updatedAtを基準にしているが、タスクエクスポートトライ日時を持たせた方が安全か？
     */
    public async reexportTasks(intervalInMinutes: number): Promise<void> {
        await this.transactionModel.findOneAndUpdate(
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Exporting,
                updatedAt: { $lt: moment().add(-intervalInMinutes, 'minutes').toISOString() }
            },
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
            }
        ).exec();
    }
    /**
     * set task status exported by transaction id
     * IDでタスクをエクスポート済に変更する
     * @param transactionId transaction id
     */
    public async setTasksExportedById(transactionId: string) {
        await this.transactionModel.findByIdAndUpdate(
            transactionId,
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Exported,
                tasksExportedAt: moment().toDate()
            }
        ).exec();
    }
    /**
     * 取引を期限切れにする
     */
    public async makeExpired(): Promise<void> {
        const endDate = moment().toDate();

        // ステータスと期限を見て更新
        await this.transactionModel.update(
            {
                status: factory.transactionStatusType.InProgress,
                expires: { $lt: endDate }
            },
            {
                status: factory.transactionStatusType.Expired,
                endDate: endDate
            },
            { multi: true }
        ).exec();
    }
    /**
     * 取引を中止する
     */
    public async cancel<T extends factory.transactionType>(
        typeOf: T,
        transactionId: string
    ): Promise<factory.transaction.ITransaction<T>> {
        const endDate = moment().toDate();

        // 進行中ステータスの取引を中止する
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: transactionId,
                status: factory.transactionStatusType.InProgress
            },
            {
                status: factory.transactionStatusType.Canceled,
                endDate: endDate
            },
            { new: true }
        ).exec();
        // NotFoundであれば取引状態確認
        if (doc === null) {
            const transaction = await this.findById<T>(typeOf, transactionId);
            if (transaction.status === factory.transactionStatusType.Canceled) {
                // すでに中止済の場合
                return transaction;
            } else if (transaction.status === factory.transactionStatusType.Expired) {
                throw new factory.errors.Argument('transactionId', 'Transaction already expired');
            } else if (transaction.status === factory.transactionStatusType.Confirmed) {
                throw new factory.errors.Argument('transactionId', 'Confirmed transaction unable to cancel');
            } else {
                throw new factory.errors.NotFound('Transaction');
            }
        }

        return doc.toObject();
    }
    public async count<T extends factory.transactionType>(params: factory.transaction.ISearchConditions<T>): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.transactionModel.countDocuments(
            { $and: conditions }
        ).setOptions({ maxTimeMS: 10000 })
            .exec();
    }
    /**
     * 取引を検索する
     */
    public async search<T extends factory.transactionType>(
        params: factory.transaction.ISearchConditions<T>
    ): Promise<factory.transaction.ITransaction<T>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.transactionModel.find(
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
