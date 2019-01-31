import * as mongoose from 'mongoose';

import * as factory from '../../../factory';

const modelName = 'Transaction';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const objectSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const resultSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const agentSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const sellerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const errorSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const potentialActionsSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 取引スキーマ
 */
const schema = new mongoose.Schema(
    {
        status: String,
        typeOf: String,
        agent: agentSchema,
        seller: sellerSchema,
        error: errorSchema,
        result: resultSchema,
        object: objectSchema,
        expires: Date,
        startDate: Date,
        endDate: Date,
        tasksExportedAt: Date,
        tasksExportationStatus: String,
        potentialActions: potentialActionsSchema
    },
    {
        collection: 'transactions',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: true,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: {
            getters: true,
            virtuals: true,
            minimize: false,
            versionKey: false
        },
        toObject: {
            getters: true,
            virtuals: true,
            minimize: false,
            versionKey: false
        }
    }
);

schema.index(
    { createdAt: 1 },
    { name: 'searchByCreatedAt' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
);
schema.index(
    { typeOf: 1 },
    { name: 'searchByTypeOf' }
);
schema.index(
    { status: 1 },
    { name: 'searchByStatus' }
);
schema.index(
    { startDate: 1 },
    { name: 'searchByStartDate' }
);
schema.index(
    { endDate: 1 },
    {
        name: 'searchByEndDate',
        partialFilterExpression: {
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { expires: 1 },
    { name: 'searchByExpires' }
);
schema.index(
    { tasksExportationStatus: 1 },
    { name: 'searchByTasksExportationStatus' }
);
schema.index(
    { tasksExportedAt: 1 },
    {
        name: 'searchByTasksExportedAt',
        partialFilterExpression: {
            tasksExportedAt: { $exists: true }
        }
    }
);
// 結果の注文番号はユニークなはず
schema.index(
    {
        typeOf: 1,
        'result.order.orderNumber': 1
    },
    {
        name: 'searchPlaceOrderByOrderNumber',
        unique: true,
        partialFilterExpression: {
            'result.order.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    {
        typeOf: 1,
        'object.order.orderNumber': 1
    },
    {
        name: 'searchReturnOrderByOrderNumber',
        partialFilterExpression: {
            'object.order.orderNumber': { $exists: true }
        }
    }
);
// ひとつの注文取引に対する確定返品取引はユニークなはず
schema.index(
    { 'object.order.orderNumber': 1 },
    {
        unique: true,
        partialFilterExpression: {
            typeOf: factory.transactionType.ReturnOrder, // 返品取引
            status: factory.transactionStatusType.Confirmed, // 確定ステータス
            'object.order.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.typeOf': 1 },
    {
        name: 'searchByAgentTypeOf',
        partialFilterExpression: {
            'agent.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.id': 1 },
    {
        name: 'searchByAgentId',
        partialFilterExpression: {
            'agent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.identifier': 1 },
    {
        name: 'searchByAgentIdentifier',
        partialFilterExpression: {
            'agent.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'seller.typeOf': 1 },
    {
        name: 'searchBySellerTypeOf',
        partialFilterExpression: {
            'seller.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'seller.id': 1 },
    {
        name: 'searchBySellerId',
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);

mongoose.model(modelName, schema)
    .on(
        'index',
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        (error) => {
            if (error !== undefined) {
                // tslint:disable-next-line:no-console
                console.error(error);
            }
        }
    );

export { modelName, schema };
