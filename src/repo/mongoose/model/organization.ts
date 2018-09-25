import * as mongoose from 'mongoose';

import MultilingualStringSchemaType from '../schemaTypes/multilingualString';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const parentOrganizationSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const locationSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const paymentAcceptedSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 組織スキーマ
 */
const schema = new mongoose.Schema(
    {
        typeOf: {
            type: String,
            required: true
        },
        identifier: String,
        name: MultilingualStringSchemaType,
        legalName: MultilingualStringSchemaType,
        sameAs: String,
        url: String,
        parentOrganization: parentOrganizationSchema,
        telephone: String,
        location: locationSchema,
        branchCode: String,
        paymentAccepted: [paymentAcceptedSchema]
    },
    {
        collection: 'organizations',
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

// 組織取得に使用
schema.index(
    { typeOf: 1, _id: 1 }
);

schema.index(
    {
        'location.branchCode': 1,
        typeOf: 1
    }
);

export default mongoose.model('Organization', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
