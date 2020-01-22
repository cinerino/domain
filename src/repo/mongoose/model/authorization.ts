import * as mongoose from 'mongoose';

const modelName = 'Authorization';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 認可スキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        typeOf: String,
        code: String,
        object: mongoose.SchemaTypes.Mixed,
        validFrom: Date,
        validUntil: Date
    },
    {
        collection: 'authorizations',
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
    { validFrom: 1 },
    { name: 'searchByValidFrom' }
);

schema.index(
    { 'project.id': 1, validFrom: 1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, validFrom: 1 },
    {
        name: 'searchByTypeOf',
        partialFilterExpression: {
            typeOf: { $exists: true }
        }
    }
);

schema.index(
    { code: 1, validFrom: 1 },
    {
        name: 'searchByCode',
        partialFilterExpression: {
            code: { $exists: true }
        }
    }
);

schema.index(
    { validUntil: 1, validFrom: 1 },
    {
        name: 'searchByValidUntil',
        partialFilterExpression: {
            validUntil: { $exists: true }
        }
    }
);

schema.index(
    { 'object.typeOf': 1, validFrom: 1 },
    {
        name: 'searchByObjectTypeOf',
        partialFilterExpression: {
            'object.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'object.id': 1, validFrom: 1 },
    {
        name: 'searchByObjectId',
        partialFilterExpression: {
            'object.id': { $exists: true }
        }
    }
);

schema.index(
    { 'object.typeOfGood.typeOf': 1, validFrom: 1 },
    {
        name: 'searchByObjectTypeOfGoodTypeOf',
        partialFilterExpression: {
            'object.typeOfGood.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'object.typeOfGood.id': 1, validFrom: 1 },
    {
        name: 'searchByObjectTypeOfGoodId',
        partialFilterExpression: {
            'object.typeOfGood.id': { $exists: true }
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
