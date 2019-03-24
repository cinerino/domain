import * as moment from 'moment';
import { Connection, Document, Model, QueryCursor } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/transaction';

/**
 * 取引リポジトリ
 */
export class MongoRepository {
    public readonly transactionModel: typeof Model;

    constructor(connection: Connection) {
        this.transactionModel = connection.model(modelName);
    }
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS(params: factory.transaction.ISearchConditions<factory.transactionType>) {
        const andConditions: any[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (typeof params.typeOf === 'string') {
            andConditions.push({
                typeOf: params.typeOf
            });
        }

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
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.agent.typeOf !== undefined) {
                andConditions.push({
                    'agent.typeOf': {
                        $exists: true,
                        $eq: params.agent.typeOf
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.agent.ids)) {
                andConditions.push({
                    'agent.id': {
                        $exists: true,
                        $in: params.agent.ids
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(params.agent.identifiers)) {
                andConditions.push({
                    'agent.identifier': {
                        $exists: true,
                        $in: params.agent.identifiers
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.agent.familyName !== undefined) {
                andConditions.push({
                    'agent.familyName': {
                        $exists: true,
                        $regex: new RegExp(params.agent.familyName, 'i')
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.agent.givenName !== undefined) {
                andConditions.push({
                    'agent.givenName': {
                        $exists: true,
                        $regex: new RegExp(params.agent.givenName, 'i')
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.agent.email !== undefined) {
                andConditions.push({
                    'agent.email': {
                        $exists: true,
                        $regex: new RegExp(params.agent.email, 'i')
                    }
                });
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.agent.telephone !== undefined) {
                andConditions.push({
                    'agent.telephone': {
                        $exists: true,
                        $regex: new RegExp(params.agent.telephone, 'i')
                    }
                });
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.tasksExportationStatuses)) {
            andConditions.push({
                tasksExportationStatus: { $in: params.tasksExportationStatuses }
            });
        }

        switch (params.typeOf) {
            case factory.transactionType.PlaceOrder:
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
                if (params.result !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (params.result.order !== undefined) {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else */
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
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (params.object !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (params.object.order !== undefined) {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore else */
                        if (Array.isArray(params.object.order.orderNumbers)) {
                            andConditions.push({
                                'object.order.orderNumber': {
                                    $exists: true,
                                    $in: params.object.order.orderNumbers
                                }
                            });
                        }
                    }
                }
                break;

            default:
        }

        return andConditions;
    }

    /**
     * 取引を開始する
     */
    public async start<T extends factory.transactionType>(
        params: factory.transaction.IStartParams<T>
    ): Promise<factory.transaction.ITransaction<T>> {
        return this.transactionModel.create({
            typeOf: params.typeOf,
            ...<Object>params,
            status: factory.transactionStatusType.InProgress,
            startDate: new Date(),
            endDate: undefined,
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        })
            .then((doc) => doc.toObject());
    }

    /**
     * 特定取引検索
     */
    public async findById<T extends factory.transactionType>(params: {
        typeOf: T;
        id: string;
    }): Promise<factory.transaction.ITransaction<T>> {
        const doc = await this.transactionModel.findOne({
            _id: params.id,
            typeOf: params.typeOf
        })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.transactionModel.modelName);
        }

        return doc.toObject();
    }

    /**
     * 進行中の取引を取得する
     */
    public async findInProgressById<T extends factory.transactionType>(params: {
        typeOf: T;
        id: string;
    }): Promise<factory.transaction.ITransaction<T>> {
        const doc = await this.transactionModel.findOne({
            _id: params.id,
            typeOf: params.typeOf,
            status: factory.transactionStatusType.InProgress
        })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.transactionModel.modelName);
        }

        return doc.toObject();
    }

    /**
     * 取引の顧客プロフィールを更新
     */
    public async updateCustomerProfile<T extends factory.transactionType>(params: {
        typeOf: T;
        id: string;
        agent: factory.transaction.placeOrder.ICustomerProfile;
    }): Promise<void> {
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                _id: params.id,
                typeOf: params.typeOf,
                status: factory.transactionStatusType.InProgress
            },
            {
                'agent.email': params.agent.email,
                'agent.familyName': params.agent.familyName,
                'agent.givenName': params.agent.givenName,
                'agent.telephone': params.agent.telephone,
                'object.customerContact': params.agent // agentでの情報保持である程度運用したら削除する
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.transactionModel.modelName);
        }
    }

    /**
     * 取引を確定する
     */
    public async confirm<T extends factory.transactionType>(params: {
        typeOf: T;
        id: string;
        authorizeActions: factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>>[];
        result: factory.transaction.IResult<T>;
        potentialActions: factory.transaction.IPotentialActions<T>;
    }): Promise<factory.transaction.ITransaction<T>> {
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                _id: params.id,
                typeOf: params.typeOf,
                status: factory.transactionStatusType.InProgress
            },
            {
                status: factory.transactionStatusType.Confirmed, // ステータス変更
                endDate: new Date(),
                'object.authorizeActions': params.authorizeActions, // 承認アクションリストを更新
                result: params.result, // resultを更新
                potentialActions: params.potentialActions // resultを更新
            },
            { new: true }
        )
            .exec();

        // NotFoundであれば取引状態確認
        if (doc === null) {
            const transaction = await this.findById({ typeOf: params.typeOf, id: params.id });
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (transaction.status === factory.transactionStatusType.Confirmed) {
                // すでに確定済の場合
                return transaction;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
            } else if (transaction.status === factory.transactionStatusType.Expired) {
                throw new factory.errors.Argument('Transaction id', 'Already expired');
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
            } else if (transaction.status === factory.transactionStatusType.Canceled) {
                throw new factory.errors.Argument('Transaction id', 'Already canceled');
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
            } else {
                throw new factory.errors.NotFound(this.transactionModel.modelName);
            }
        }

        return doc.toObject();
    }

    /**
     * タスク未エクスポートの取引をひとつ取得してエクスポートを開始する
     */
    public async startExportTasks<T extends factory.transactionType>(params: {
        typeOf: T;
        status: factory.transactionStatusType;
    }): Promise<factory.transaction.ITransaction<T> | null> {
        return this.transactionModel.findOneAndUpdate(
            {
                typeOf: params.typeOf,
                status: params.status,
                tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
            },
            { tasksExportationStatus: factory.transactionTasksExportationStatus.Exporting },
            { new: true }
        )
            .exec()
            .then((doc) => (doc === null) ? null : doc.toObject());
    }

    // tslint:disable-next-line:no-suspicious-comment
    /**
     * タスクエクスポートリトライ
     * TODO updatedAtを基準にしているが、タスクエクスポートトライ日時を持たせた方が安全か？
     */
    public async reexportTasks(params: { intervalInMinutes: number }): Promise<void> {
        await this.transactionModel.findOneAndUpdate(
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Exporting,
                updatedAt: {
                    $lt: moment()
                        .add(-params.intervalInMinutes, 'minutes')
                        .toISOString()
                }
            },
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
            }
        )
            .exec();
    }

    /**
     * set task status exported by transaction id
     * IDでタスクをエクスポート済に変更する
     */
    public async setTasksExportedById(params: { id: string }) {
        await this.transactionModel.findByIdAndUpdate(
            params.id,
            {
                tasksExportationStatus: factory.transactionTasksExportationStatus.Exported,
                tasksExportedAt: moment()
                    .toDate()
            }
        )
            .exec();
    }

    /**
     * 取引を期限切れにする
     */
    public async makeExpired(): Promise<void> {
        const endDate = moment()
            .toDate();

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
        )
            .exec();
    }

    /**
     * 取引を中止する
     */
    public async cancel<T extends factory.transactionType>(params: {
        typeOf: T;
        id: string;
    }): Promise<factory.transaction.ITransaction<T>> {
        const endDate = moment()
            .toDate();

        // 進行中ステータスの取引を中止する
        const doc = await this.transactionModel.findOneAndUpdate(
            {
                typeOf: params.typeOf,
                _id: params.id,
                status: factory.transactionStatusType.InProgress
            },
            {
                status: factory.transactionStatusType.Canceled,
                endDate: endDate
            },
            { new: true }
        )
            .exec();
        // NotFoundであれば取引状態確認
        if (doc === null) {
            const transaction = await this.findById<T>(params);
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (transaction.status === factory.transactionStatusType.Canceled) {
                // すでに中止済の場合
                return transaction;
            } else if (transaction.status === factory.transactionStatusType.Expired) {
                throw new factory.errors.Argument('Transaction id', 'Transaction already expired');
            } else if (transaction.status === factory.transactionStatusType.Confirmed) {
                throw new factory.errors.Argument('Transaction id', 'Confirmed transaction unable to cancel');
            } else {
                throw new factory.errors.NotFound(this.transactionModel.modelName);
            }
        }

        return doc.toObject();
    }
    public async count<T extends factory.transactionType>(params: factory.transaction.ISearchConditions<T>): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.transactionModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * 取引を検索する
     */
    public async search<T extends factory.transactionType>(
        params: factory.transaction.ISearchConditions<T>
    ): Promise<factory.transaction.ITransaction<T>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.transactionModel.find((conditions.length > 0) ? { $and: conditions } : {})
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

        return query.setOptions({ maxTimeMS: 30000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    public stream<T extends factory.transactionType>(
        params: factory.transaction.ISearchConditions<T>
    ): QueryCursor<Document> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.transactionModel.find((conditions.length > 0) ? { $and: conditions } : {})
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

        // return query.cursor();
        return query.cursor();
    }
}
