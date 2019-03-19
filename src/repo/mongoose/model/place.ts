import * as mongoose from 'mongoose';

import MultilingualStringSchemaType from '../schemaTypes/multilingualString';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const modelName = 'Place';

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
        typeOf: {
            type: String,
            required: true
        },
        identifier: mongoose.SchemaTypes.Mixed,
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
        kanaName: String,
        additionalProperty: [mongoose.SchemaTypes.Mixed]
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
