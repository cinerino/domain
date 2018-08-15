import * as factory from '@cinerino/factory';
import { Connection } from 'mongoose';

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
    public async complete<T extends factory.actionType>(
        typeOf: T,
        actionId: string,
        result: any
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            {
                actionStatus: factory.actionStatusType.CompletedActionStatus,
                result: result,
                endDate: new Date()
            },
            { new: true }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');
            }

            return doc.toObject();
        });
    }

    /**
     * アクション中止
     */
    public async cancel<T extends factory.actionType>(
        typeOf: T,
        actionId: string
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            { actionStatus: factory.actionStatusType.CanceledActionStatus },
            { new: true }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');

            }

            return doc.toObject();
        });
    }

    /**
     * アクション失敗
     */
    public async giveUp<T extends factory.actionType>(
        typeOf: T,
        actionId: string,
        error: any
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            {
                actionStatus: factory.actionStatusType.FailedActionStatus,
                error: error,
                endDate: new Date()
            },
            { new: true }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');
            }

            return doc.toObject();
        });
    }

    /**
     * IDで取得する
     */
    public async findById<T extends factory.actionType>(
        typeOf: T,
        actionId: string
    ): Promise<IAction<T>> {
        return this.actionModel.findOne(
            {
                typeOf: typeOf,
                _id: actionId
            }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');
            }

            return doc.toObject();
        });
    }

    /**
     * 取引内の承認アクションを取得する
     * @param transactionId 取引ID
     */
    public async findAuthorizeByTransactionId(transactionId: string): Promise<IAuthorizeAction[]> {
        return this.actionModel.find({
            typeOf: factory.actionType.AuthorizeAction,
            'purpose.id': {
                $exists: true,
                $eq: transactionId
            }
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    }

    /**
     * 注文番号から、注文に対するアクションを検索する
     * @param orderNumber 注文番号
     */
    public async findByOrderNumber(orderNumber: string): Promise<IAction<factory.actionType>[]> {
        return this.actionModel.find({
            $or: [
                { 'object.orderNumber': orderNumber },
                { 'purpose.orderNumber': orderNumber }
            ]
        })
            .sort({ endDate: -1 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));

    }
}
