import { Connection, Model } from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/action';

export type IAction<T extends factory.actionType> =
    T extends factory.actionType.OrderAction ? factory.action.trade.order.IAction :
    T extends factory.actionType.AuthorizeAction ? factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>> :
    factory.action.IAction<factory.action.IAttributes<T, any, any>>;

/**
 * アクションリポジトリ
 */
export class MongoRepository {
    public readonly actionModel: typeof Model;

    constructor(connection: Connection) {
        this.actionModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS<T extends factory.actionType>(params: factory.action.ISearchConditions<T>) {
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
        if (params.object !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.typeOf !== undefined) {
                if (Array.isArray(params.object.typeOf.$in)) {
                    andConditions.push({
                        'object.typeOf': {
                            $exists: true,
                            $in: params.object.typeOf.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.id !== undefined) {
                if (Array.isArray(params.object.id.$in)) {
                    andConditions.push({
                        'object.id': {
                            $exists: true,
                            $in: params.object.id.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.orderNumber !== undefined) {
                if (Array.isArray(params.object.orderNumber.$in)) {
                    andConditions.push({
                        'object.orderNumber': {
                            $exists: true,
                            $in: params.object.orderNumber.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.paymentMethod !== undefined) {
                if (params.object.paymentMethod.paymentMethodId !== undefined) {
                    if (Array.isArray(params.object.paymentMethod.paymentMethodId.$in)) {
                        andConditions.push({
                            'object.paymentMethod.paymentMethodId': {
                                $exists: true,
                                $in: params.object.paymentMethod.paymentMethodId.$in
                            }
                        });
                    }
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.event !== undefined) {
                if (params.object.event.id !== undefined) {
                    if (Array.isArray(params.object.event.id.$in)) {
                        andConditions.push({
                            'object.event.id': {
                                $exists: true,
                                $in: params.object.event.id.$in
                            }
                        });
                    }
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.object.acceptedOffer !== undefined) {
                if (params.object.acceptedOffer.ticketedSeat !== undefined) {
                    if (params.object.acceptedOffer.ticketedSeat.seatNumber !== undefined) {
                        if (Array.isArray(params.object.acceptedOffer.ticketedSeat.seatNumber.$in)) {
                            andConditions.push({
                                'object.acceptedOffer.ticketedSeat.seatNumber': {
                                    $exists: true,
                                    $in: params.object.acceptedOffer.ticketedSeat.seatNumber.$in
                                }
                            });
                        }
                    }
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.purpose !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.purpose.typeOf !== undefined) {
                if (Array.isArray(params.purpose.typeOf.$in)) {
                    andConditions.push({
                        'purpose.typeOf': {
                            $exists: true,
                            $in: params.purpose.typeOf.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.purpose.id !== undefined) {
                if (Array.isArray(params.purpose.id.$in)) {
                    andConditions.push({
                        'purpose.id': {
                            $exists: true,
                            $in: params.purpose.id.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.purpose.orderNumber !== undefined) {
                if (Array.isArray(params.purpose.orderNumber.$in)) {
                    andConditions.push({
                        'purpose.orderNumber': {
                            $exists: true,
                            $in: params.purpose.orderNumber.$in
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.result !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.result.typeOf !== undefined) {
                if (Array.isArray(params.result.typeOf.$in)) {
                    andConditions.push({
                        'result.typeOf': {
                            $exists: true,
                            $in: params.result.typeOf.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.result.id !== undefined) {
                if (Array.isArray(params.result.id.$in)) {
                    andConditions.push({
                        'result.id': {
                            $exists: true,
                            $in: params.result.id.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.result.orderNumber !== undefined) {
                if (Array.isArray(params.result.orderNumber.$in)) {
                    andConditions.push({
                        'result.orderNumber': {
                            $exists: true,
                            $in: params.result.orderNumber.$in
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.typeOf !== undefined) {
            andConditions.push({
                typeOf: params.typeOf
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.actionStatusTypes)) {
            andConditions.push({
                actionStatus: { $in: params.actionStatusTypes }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startFrom instanceof Date) {
            andConditions.push({
                startDate: { $gte: params.startFrom }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startThrough instanceof Date) {
            andConditions.push({
                startDate: { $lte: params.startThrough }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.fromLocation !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.fromLocation.typeOf !== undefined) {
                if (Array.isArray(params.fromLocation.typeOf.$in)) {
                    andConditions.push({
                        'fromLocation.typeOf': {
                            $exists: true,
                            $in: params.fromLocation.typeOf.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.fromLocation.accountNumber !== undefined) {
                if (Array.isArray(params.fromLocation.accountNumber.$in)) {
                    andConditions.push({
                        'fromLocation.accountNumber': {
                            $exists: true,
                            $in: params.fromLocation.accountNumber.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.fromLocation.accountType !== undefined) {
                if (Array.isArray(params.fromLocation.accountType.$in)) {
                    andConditions.push({
                        'fromLocation.accountType': {
                            $exists: true,
                            $in: params.fromLocation.accountType.$in
                        }
                    });
                }
            }
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.toLocation !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.toLocation.typeOf !== undefined) {
                if (Array.isArray(params.toLocation.typeOf.$in)) {
                    andConditions.push({
                        'toLocation.typeOf': {
                            $exists: true,
                            $in: params.toLocation.typeOf.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.toLocation.accountNumber !== undefined) {
                if (Array.isArray(params.toLocation.accountNumber.$in)) {
                    andConditions.push({
                        'toLocation.accountNumber': {
                            $exists: true,
                            $in: params.toLocation.accountNumber.$in
                        }
                    });
                }
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.toLocation.accountType !== undefined) {
                if (Array.isArray(params.toLocation.accountType.$in)) {
                    andConditions.push({
                        'toLocation.accountType': {
                            $exists: true,
                            $in: params.toLocation.accountType.$in
                        }
                    });
                }
            }
        }

        return andConditions;
    }

    public async count<T extends factory.actionType>(params: factory.action.ISearchConditions<T>): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.actionModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * アクション検索
     */
    public async search<T extends factory.actionType>(
        params: factory.action.ISearchConditions<T>
    ): Promise<IAction<T>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.actionModel.find(
            (conditions.length > 0) ? { $and: conditions } : {},
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

        // const explainResult = await (<any>query).explain();
        // console.log(explainResult[0].executionStats.allPlansExecution.map((e: any) => e.executionStages.inputStage));

        return query.setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
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
        ticket: factory.action.transfer.print.ticket.ITicket,
        project: factory.project.IProject
    ): Promise<factory.action.transfer.print.ticket.IAction> {
        const now = new Date();
        const action: factory.action.transfer.print.ticket.IAction = {
            project: project,
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
