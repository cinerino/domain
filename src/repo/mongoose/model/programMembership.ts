import * as mongoose from 'mongoose';

const modelName = 'ProgramMembership';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 会員プログラムスキーマ
 */
const schema = new mongoose.Schema(
    {
        description: mongoose.SchemaTypes.Mixed,
        hostingOrganization: mongoose.SchemaTypes.Mixed,
        membershipPointsEarned: mongoose.SchemaTypes.Mixed,
        name: mongoose.SchemaTypes.Mixed,
        offers: [mongoose.SchemaTypes.Mixed],
        project: mongoose.SchemaTypes.Mixed,
        typeOf: {
            type: String,
            required: true
        }
    },
    {
        collection: 'programMemberships',
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
    { 'project.id': 1 },
    {
        name: 'searchByProjectId',
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
