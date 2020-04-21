import * as mongoose from 'mongoose';

const modelName = 'Organization';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * 組織スキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        typeOf: {
            type: String,
            required: true
        },
        identifier: String,
        name: mongoose.SchemaTypes.Mixed,
        legalName: mongoose.SchemaTypes.Mixed,
        sameAs: String,
        url: String,
        parentOrganization: mongoose.SchemaTypes.Mixed,
        telephone: String,
        location: mongoose.SchemaTypes.Mixed,
        branchCode: String,
        paymentAccepted: [mongoose.SchemaTypes.Mixed],
        hasMerchantReturnPolicy: [mongoose.SchemaTypes.Mixed],
        hasPOS: [mongoose.SchemaTypes.Mixed],
        areaServed: [mongoose.SchemaTypes.Mixed],
        makesOffer: [mongoose.SchemaTypes.Mixed],
        additionalProperty: [mongoose.SchemaTypes.Mixed]
    },
    {
        collection: 'organizations',
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

// 組織取得に使用
schema.index(
    { typeOf: 1, _id: 1 }
);
schema.index(
    { typeOf: 1 },
    {
        name: 'searchByType'
    }
);
schema.index(
    { name: 1 },
    {
        name: 'searchByName',
        partialFilterExpression: {
            name: { $exists: true }
        }
    }
);
schema.index(
    { 'location.typeOf': 1 },
    {
        name: 'searchByLocationType',
        partialFilterExpression: {
            'location.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'location.branchCode': 1 },
    {
        name: 'searchByLocationBranchCode',
        partialFilterExpression: {
            'location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'location.name': 1 },
    {
        name: 'searchByLocationName',
        partialFilterExpression: {
            'location.name': { $exists: true }
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
