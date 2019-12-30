import * as mongoose from 'mongoose';

const modelName = 'Member';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * プロジェクトメンバースキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        typeOf: String,
        member: mongoose.SchemaTypes.Mixed
    },
    {
        collection: 'members',
        id: true,
        read: 'primaryPreferred',
        writeConcern: writeConcern,
        strict: false,
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
    { 'project.id': 1, 'member.id': 1 },
    {
        name: 'uniqueProjectMember',
        unique: true
    }
);

schema.index(
    { 'member.username': 1 },
    {
        name: 'searchByMemberUsername'
    }
);

schema.index(
    { 'member.id': 1, 'member.username': 1 },
    {
        name: 'searchByMemberId'
    }
);

schema.index(
    { 'project.id': 1, 'member.username': 1 },
    {
        name: 'searchByProjectId'
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
