import * as mongoose from 'mongoose';

import * as factory from '../../../factory';

const modelName = 'Transaction';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 取引スキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        status: String,
        typeOf: String,
        agent: mongoose.SchemaTypes.Mixed,
        recipient: mongoose.SchemaTypes.Mixed,
        seller: mongoose.SchemaTypes.Mixed,
        error: mongoose.SchemaTypes.Mixed,
        result: mongoose.SchemaTypes.Mixed,
        object: mongoose.SchemaTypes.Mixed,
        expires: Date,
        startDate: Date,
        endDate: Date,
        tasksExportedAt: Date,
        tasksExportationStatus: String,
        potentialActions: mongoose.SchemaTypes.Mixed
    },
    {
        collection: 'transactions',
        id: true,
        read: 'primaryPreferred',
        writeConcern: writeConcern,
        strict: true,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: {
            getters: false,
            virtuals: false,
            minimize: false,
            versionKey: false
        },
        toObject: {
            getters: false,
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
    { 'project.id': 1, startDate: -1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, startDate: -1 },
    { name: 'searchByTypeOfAndStartDate' }
);
schema.index(
    { status: 1, startDate: -1 },
    { name: 'searchByStatusAndStartDate' }
);
schema.index(
    { startDate: -1 },
    { name: 'searchByStartDateDescending' }
);
schema.index(
    { endDate: 1, startDate: -1 },
    {
        name: 'searchByEndDateAndStartDate',
        partialFilterExpression: {
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { expires: 1, startDate: -1 },
    { name: 'searchByExpiresAndStartDate' }
);
schema.index(
    { tasksExportationStatus: 1, startDate: -1 },
    { name: 'searchByTasksExportationStatusAndStartDate' }
);
schema.index(
    { tasksExportedAt: 1, startDate: -1 },
    {
        name: 'searchByTasksExportedAtAndStartDate',
        partialFilterExpression: {
            tasksExportedAt: { $exists: true }
        }
    }
);
schema.index(
    { 'result.order.confirmationNumber': 1, startDate: -1 },
    {
        name: 'searchByResultOrderConfirmationNumber',
        partialFilterExpression: {
            'result.order.confirmationNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'result.order.orderNumber': 1, startDate: -1 },
    {
        name: 'searchByResultOrderNumberAndStartDate',
        partialFilterExpression: {
            'result.order.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'object.confirmationNumber': 1, startDate: -1 },
    {
        name: 'searchByObjectConfirmationNumber',
        partialFilterExpression: {
            'object.confirmationNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'object.orderNumber': 1, startDate: -1 },
    {
        name: 'searchByObjectOrderNumber',
        partialFilterExpression: {
            'object.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'object.identifier': 1, startDate: -1 },
    {
        name: 'searchByObjectIdentifier',
        partialFilterExpression: {
            'object.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'object.order.orderNumber': 1, startDate: -1 },
    {
        name: 'searchByObjectOrderNumberAndStartDate',
        partialFilterExpression: {
            'object.order.orderNumber': { $exists: true }
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
    { 'agent.typeOf': 1, startDate: -1 },
    {
        name: 'searchByAgentTypeOfAndStartDate',
        partialFilterExpression: {
            'agent.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.id': 1, startDate: -1 },
    {
        name: 'searchByAgentIdAndStartDate',
        partialFilterExpression: {
            'agent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.identifier': 1, startDate: -1 },
    {
        name: 'searchByAgentIdentifierAndStartDate',
        partialFilterExpression: {
            'agent.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.familyName': 1, startDate: -1 },
    {
        name: 'searchByAgentFamilyName',
        partialFilterExpression: {
            'agent.familyName': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.givenName': 1, startDate: -1 },
    {
        name: 'searchByAgentGivenName',
        partialFilterExpression: {
            'agent.givenName': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.email': 1, startDate: -1 },
    {
        name: 'searchByAgentEmail',
        partialFilterExpression: {
            'agent.email': { $exists: true }
        }
    }
);
schema.index(
    { 'agent.telephone': 1, startDate: -1 },
    {
        name: 'searchByAgentTelephone',
        partialFilterExpression: {
            'agent.telephone': { $exists: true }
        }
    }
);
schema.index(
    { 'seller.typeOf': 1, startDate: -1 },
    {
        name: 'searchBySellerTypeOfAndStartDate',
        partialFilterExpression: {
            'seller.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'seller.id': 1, startDate: -1 },
    {
        name: 'searchBySellerIdAndStartDate',
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, status: 1, tasksExportationStatus: 1 },
    {
        name: 'startExportTasks'
    }
);
schema.index(
    { 'project.id': 1, typeOf: 1, status: 1, tasksExportationStatus: 1 },
    {
        name: 'startExportTasks-v2',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { tasksExportationStatus: 1, updatedAt: 1 },
    {
        name: 'reexportTasks'
    }
);
schema.index(
    { 'project.id': 1, tasksExportationStatus: 1, updatedAt: 1 },
    {
        name: 'reexportTasks-v2',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { status: 1, expires: 1 },
    {
        name: 'makeExpired'
    }
);
schema.index(
    { 'project.id': 1, status: 1, expires: 1 },
    {
        name: 'makeExpired-v2',
        partialFilterExpression: {
            'project.id': { $exists: true }
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
