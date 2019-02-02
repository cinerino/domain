import * as mongoose from 'mongoose';

const modelName = 'Task';

import * as factory from '../../../factory';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const executionResultSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const dataSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * タスクスキーマ
 */
const schema = new mongoose.Schema(
    {
        name: String,
        status: String,
        runsAt: Date,
        remainingNumberOfTries: Number,
        lastTriedAt: Date,
        numberOfTried: Number,
        executionResults: [executionResultSchema],
        data: dataSchema
    },
    {
        collection: 'tasks',
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
    { name: 1 },
    { name: 'searchByName' }
);
schema.index(
    { status: 1 },
    { name: 'searchByStatus' }
);
schema.index(
    { runsAt: 1 },
    { name: 'searchByRunsAt' }
);
schema.index(
    { lastTriedAt: 1 },
    {
        name: 'searchByLastTriedAt',
        partialFilterExpression: {
            lastTriedAt: { $type: 'date' }
        }
    }
);
schema.index(
    { remainingNumberOfTries: 1 },
    { name: 'searchByRemainingNumberOfTries' }
);
schema.index(
    { numberOfTried: 1 },
    { name: 'searchByNumberOfTried' }
);
schema.index(
    { 'data.transactionId': 1 },
    {
        partialFilterExpression: {
            'data.transactionId': { $exists: true }
        }
    }
);
schema.index(
    {
        name: 1,
        'data.agent.memberOf.membershipNumber': 1,
        'data.object.itemOffered.id': 1
    },
    {
        name: 'findRegisterProgramMembershipByMemberAndProgram',
        partialFilterExpression: {
            name: factory.taskName.RegisterProgramMembership,
            'data.agent.memberOf.membershipNumber': { $exists: true },
            'data.object.itemOffered.id': { $exists: true }
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
