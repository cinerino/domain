import * as mongoose from 'mongoose';

const modelName = 'PaymentMethod';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

const serviceOutputSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 決済方法スキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        typeOf: {
            type: String,
            required: true
        },
        identifier: String,
        accessCode: String,
        serviceType: String,
        serviceOutput: serviceOutputSchema
    },
    {
        collection: 'paymentMethods',
        id: true,
        read: 'primaryPreferred',
        writeConcern: writeConcern,
        strict: false, // 今後、決済方法スキーマにどんなデータが入ってくるか未知数なので、あえて柔軟に
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
    { 'project.id': 1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1 },
    { name: 'searchByTypeOf' }
);
schema.index(
    { identifier: 1 },
    {
        name: 'searchByIdentifier',
        partialFilterExpression: {
            identifier: { $exists: true }
        }
    }
);
schema.index(
    { accessCode: 1 },
    {
        name: 'searchByAccessCode',
        partialFilterExpression: {
            accessCode: { $exists: true }
        }
    }
);
schema.index(
    { serviceType: 1 },
    {
        name: 'searchByServiceType',
        partialFilterExpression: {
            serviceType: { $exists: true }
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
