import * as mongoose from 'mongoose';

const modelName = 'Project';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * プロジェクトスキーマ
 */
const schema = new mongoose.Schema(
    {
        _id: String,
        typeOf: {
            type: String,
            required: true
        }
    },
    {
        collection: 'projects',
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
