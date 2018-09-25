import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const purposeSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
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
const errorSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 測定スキーマ
 */
const schema = new mongoose.Schema(
    {
        result: resultSchema,
        error: errorSchema,
        object: objectSchema,
        startDate: Date,
        endDate: Date,
        purpose: purposeSchema
    },
    {
        collection: 'telemetries',
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

// 測定データ参照時に使用
schema.index(
    { 'purpose.typeOf': 1, 'object.scope': 1, 'object.measureDate': 1 },
    {
        name: 'searchByMeasureDate',
        partialFilterExpression: {
            'purpose.typeOf': { $exists: true },
            'object.scope': { $exists: true },
            'object.measureDate': { $exists: true }
        }
    }
);

export default mongoose.model('Telemetry', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
