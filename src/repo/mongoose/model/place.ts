import * as mongoose from 'mongoose';

import MultilingualStringSchemaType from '../schemaTypes/multilingualString';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const containedInPlaceSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const containsPlaceSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const openingHoursSpecificationSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 場所スキーマ
 */
const schema = new mongoose.Schema(
    {
        _id: String,
        typeOf: {
            type: String,
            required: true
        },
        name: MultilingualStringSchemaType,
        description: MultilingualStringSchemaType,
        address: MultilingualStringSchemaType,
        branchCode: String,
        containedInPlace: containedInPlaceSchema,
        containsPlace: [containsPlaceSchema],
        maximumAttendeeCapacity: Number,
        openingHoursSpecification: openingHoursSpecificationSchema,
        smokingAllowed: Boolean,
        telephone: String,
        sameAs: String,
        url: String,
        kanaName: String
    },
    {
        collection: 'places',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: true,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: { getters: true },
        toObject: { getters: true }
    }
);

// 劇場検索に使用
schema.index(
    { branchCode: 1, typeOf: 1 }
);

export default mongoose.model('Place', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
