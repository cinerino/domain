import * as mongoose from 'mongoose';

const modelName = 'ProgramMembership';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 会員プログラムスキーマ
 */
const schema = new mongoose.Schema(
    {
        award: [mongoose.SchemaTypes.Mixed],
        description: String,
        hostingOrganization: mongoose.SchemaTypes.Mixed,
        membershipPointsEarned: mongoose.SchemaTypes.Mixed,
        name: String,
        offers: [mongoose.SchemaTypes.Mixed],
        programName: String,
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
