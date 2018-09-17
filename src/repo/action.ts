import { Connection } from 'mongoose';

import * as factory from '../factory';
import ActionModel from './mongoose/model/action';

export type IAuthorizeAction = factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>>;
export type IAction<T extends factory.actionType> =
    T extends factory.actionType.OrderAction ? factory.action.trade.order.IAction :
    T extends factory.actionType.AuthorizeAction ? factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>> :
    factory.action.IAction<factory.action.IAttributes<T, any, any>>;
/**
 * アクションリポジトリー
 */
export class MongoRepository {
    public readonly actionModel: typeof ActionModel;
    constructor(connection: Connection) {
        this.actionModel = connection.model(ActionModel.modelName);
    }
    /**
     * アクション開始
     */
    public async start<T extends factory.actionType>(attributes: factory.action.IAttributes<T, any, any>): Promise<IAction<T>> {
        return this.actionModel.create({
            ...attributes,
            actionStatus: factory.actionStatusType.ActiveActionStatus,
            startDate: new Date()
        }).then((doc) => doc.toObject());
    }
    /**
     * アクション完了
     */
    public async complete<T extends factory.actionType>(params: {
        typeOf: T;
        id: string;
        result: any;
    }): Promise<IAction<T>> {
        const doc = await this.actionModel.findOneAndUpdate(
            {
                typeOf: params.typeOf,
                _id: params.id
            },
            {
                actionStatus: factory.actionStatusType.CompletedActionStatus,
                result: params.result,
                endDate: new Date()
            },
            { new: true }
        ).select({ __v: 0, createdAt: 0, updatedAt: 0 }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }
    /**
     * アクション取消
     */
    public async cancel<T extends factory.actionType>(params: {
        typeOf: T;
        id: string;
    }): Promise<IAction<T>> {
        const doc = await this.actionModel.findOneAndUpdate(
            {
                typeOf: params.typeOf,
                _id: params.id
            },
            { actionStatus: factory.actionStatusType.CanceledActionStatus },
            { new: true }
        ).select({ __v: 0, createdAt: 0, updatedAt: 0 }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }
    /**
     * アクション失敗
     */
    public async giveUp<T extends factory.actionType>(params: {
        typeOf: T;
        id: string;
        error: any;
    }): Promise<IAction<T>> {
        const doc = await this.actionModel.findOneAndUpdate(
            {
                typeOf: params.typeOf,
                _id: params.id
            },
            {
                actionStatus: factory.actionStatusType.FailedActionStatus,
                error: params.error,
                endDate: new Date()
            },
            { new: true }
        ).select({ __v: 0, createdAt: 0, updatedAt: 0 }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }
    /**
     * IDで取得する
     */
    public async findById<T extends factory.actionType>(params: {
        typeOf: T;
        id: string;
    }): Promise<IAction<T>> {
        const doc = await this.actionModel.findOne(
            {
                typeOf: params.typeOf,
                _id: params.id
            }
        ).select({ __v: 0, createdAt: 0, updatedAt: 0 }).exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }
    /**
     * 取引内の承認アクションを取得する
     */
    public async findAuthorizeByTransactionId(params: { transactionId: string }): Promise<IAuthorizeAction[]> {
        return this.actionModel.find({
            typeOf: factory.actionType.AuthorizeAction,
            'purpose.id': {
                $exists: true,
                $eq: params.transactionId
            }
        }).select({ __v: 0, createdAt: 0, updatedAt: 0 }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    }
    /**
     * 取引に対するアクションを検索する
     */
    public async searchByTransactionId(params: {
        transactionType: factory.transactionType;
        transactionId: string;
        sort?: factory.action.ISortOrder;
    }): Promise<IAction<factory.actionType>[]> {
        const conditions = {
            'purpose.typeOf': {
                $exists: true,
                $eq: params.transactionType
            },
            'purpose.id': {
                $exists: true,
                $eq: params.transactionId
            }
        };
        const query = this.actionModel.find(conditions).select({ __v: 0, createdAt: 0, updatedAt: 0 });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.exec().then((docs) => docs.map((doc) => doc.toObject()));
    }
    /**
     * 注文番号から、注文に対するアクションを検索する
     */
    public async searchByOrderNumber(params: {
        orderNumber: string;
        sort?: factory.action.ISortOrder;
    }): Promise<IAction<factory.actionType>[]> {
        const conditions = {
            $or: [
                { 'object.orderNumber': params.orderNumber },
                { 'purpose.orderNumber': params.orderNumber }
            ]
        };
        const query = this.actionModel.find(conditions).select({ __v: 0, createdAt: 0, updatedAt: 0 });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.exec().then((docs) => docs.map((doc) => doc.toObject()));
    }
}
