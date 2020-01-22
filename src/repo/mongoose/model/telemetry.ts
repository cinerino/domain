import * as mongoose from 'mongoose';

const modelName = 'Telemetry';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

const purposeSchema = new mongoose.Schema(
    {
        typeOf: String
    },
    {
        id: false,
        _id: false,
        strict: false
    }
);

const objectSchema = new mongoose.Schema(
    {
        measuredAt: Date
    },
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
        project: mongoose.SchemaTypes.Mixed,
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
    { 'project.id': 1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

// 測定データ参照時に使用
schema.index(
    { 'object.measuredAt': 1 },
    {
        partialFilterExpression: {
            'object.measuredAt': { $exists: true }
        }
    }
);
schema.index(
    { 'purpose.typeOf': 1, 'object.scope': 1, 'object.measuredAt': 1 },
    {
        partialFilterExpression: {
            'purpose.typeOf': { $exists: true },
            'object.scope': { $exists: true },
            'object.measuredAt': { $exists: true }
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
