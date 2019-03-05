import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/action';

export type IAction<T extends factory.actionType> =
    T extends factory.actionType.OrderAction ? factory.action.trade.order.IAction :
    T extends factory.actionType.AuthorizeAction ? factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>> :
    factory.action.IAction<factory.action.IAttributes<T, any, any>>;

/**
 * アクションリポジトリー
 */
export class MongoRepository {
    public readonly actionModel: typeof Model;

    constructor(connection: Connection) {
        this.actionModel = connection.model(modelName);
    }

    /**
     * アクション開始
     */
    public async start<T extends factory.actionType>(attributes: factory.action.IAttributes<T, any, any>): Promise<IAction<T>> {
        return this.actionModel.create({
            ...attributes,
            actionStatus: factory.actionStatusType.ActiveActionStatus,
            startDate: new Date()
        })
            .then((doc) => doc.toObject());
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
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
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
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
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
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }

    /**
     * 特定アクション検索
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
        )
            .select({ __v: 0, createdAt: 0, updatedAt: 0 })
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.actionModel.modelName);
        }

        return doc.toObject();
    }

    /**
     * アクション目的から検索する
     * 取引に対するアクション検索時などに使用
     */
    public async searchByPurpose<T extends factory.actionType>(params: {
        typeOf?: T;
        purpose: {
            typeOf: factory.transactionType;
            id?: string;
        };
        sort?: factory.action.ISortOrder;
    }): Promise<IAction<T>[]> {
        const conditions: any = {
            'purpose.typeOf': {
                $exists: true,
                $eq: params.purpose.typeOf
            }
        };

        if (params.typeOf !== undefined) {
            conditions.typeOf = params.typeOf;
        }

        if (params.purpose.id !== undefined) {
            conditions['purpose.id'] = {
                $exists: true,
                $eq: params.purpose.id
            };
        }

        const query = this.actionModel.find(conditions)
            .select({ __v: 0, createdAt: 0, updatedAt: 0 });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
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
        const query = this.actionModel.find(conditions)
            .select({ __v: 0, createdAt: 0, updatedAt: 0 });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.sort !== undefined) {
            query.sort(params.sort);
        }

        return query.exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    public async printTicket(
        agentId: string,
        ticket: factory.action.transfer.print.ticket.ITicket
    ): Promise<factory.action.transfer.print.ticket.IAction> {
        const now = new Date();
        const action: factory.action.transfer.print.ticket.IAction = {
            id: '',
            typeOf: factory.actionType.PrintAction,
            actionStatus: factory.actionStatusType.CompletedActionStatus,
            object: {
                typeOf: 'Ticket',
                ticketToken: ticket.ticketToken
            },
            agent: {
                typeOf: factory.personType.Person,
                id: agentId
            },
            startDate: now,
            endDate: now
        };

        return this.actionModel.create(action)
            .then((doc) => <factory.action.transfer.print.ticket.IAction>doc.toObject());
    }

    public async searchPrintTicket(
        conditions: factory.action.transfer.print.ticket.ISearchConditions
    ): Promise<factory.action.transfer.print.ticket.IAction[]> {
        return this.actionModel.find(
            {
                typeOf: factory.actionType.PrintAction,
                'agent.id': conditions.agentId,
                'object.typeOf': 'Ticket',
                'object.ticketToken': conditions.ticketToken
            }
        )
            .exec()
            .then((docs) => docs.map((doc) => <factory.action.transfer.print.ticket.IAction>doc.toObject()));
    }
}
