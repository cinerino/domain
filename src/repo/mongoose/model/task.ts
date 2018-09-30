import * as mongoose from 'mongoose';

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

// 取引のタスク検索に使用
schema.index(
    { 'data.transactionId': 1 },
    {
        partialFilterExpression: {
            'data.transactionId': { $exists: true }
        }
    }
);
// 基本的にグループごとに、ステータスと実行日時を見て、タスクは実行される
schema.index(
    { name: 1, status: 1, numberOfTried: 1, runsAt: 1 }
);
// ステータス&最終トライ日時&残りトライ可能回数を見て、リトライor中止を決定する
schema.index(
    { remainingNumberOfTries: 1, status: 1, lastTriedAt: 1 },
    {
        partialFilterExpression: {
            lastTriedAt: { $type: 'date' }
        }
    }
);
// 測定データ作成時に使用
schema.index({ status: 1, runsAt: 1 });
schema.index({ name: 1, createdAt: 1 });
schema.index(
    { status: 1, name: 1, lastTriedAt: 1 },
    {
        partialFilterExpression: {
            lastTriedAt: { $type: 'date' }
        }
    }
);
// 会員プログラム登録解除に使用
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

export default mongoose.model('Task', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
