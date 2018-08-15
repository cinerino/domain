import * as mongoose from 'mongoose';

import MultilingualStringSchemaType from '../schemaTypes/multilingualString';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const locationSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const workPerformedSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const superEventSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * イベント(公演など)スキーマ
 */
const schema = new mongoose.Schema(
    {
        _id: String,
        typeOf: {
            type: String,
            required: true
        },
        identifier: String,
        name: MultilingualStringSchemaType,
        description: MultilingualStringSchemaType,
        doorTime: Date,
        duration: String,
        endDate: Date,
        eventStatus: String,
        location: locationSchema,
        startDate: Date,
        workPerformed: workPerformedSchema,
        superEvent: superEventSchema,
        videoFormat: String,
        subtitleLanguage: String,
        kanaName: String,
        alternativeHeadline: String,
        ticketTypeGroup: String
    },
    {
        collection: 'events',
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

// 上映イベント検索に使用
schema.index(
    {
        typeOf: 1,
        'superEvent.location.branchCode': 1
    },
    {
        partialFilterExpression: {
            'superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    {
        typeOf: 1,
        'superEvent.location.identifier': 1,
        startDate: 1
    },
    {
        partialFilterExpression: {
            'superEvent.location.identifier': { $exists: true }
        },
        name: 'searchScreeningEventsConditions'
    }
);
schema.index({ typeOf: 1, startDate: 1 });
schema.index({ typeOf: 1, endDate: 1 });

// 上映イベント取得に使用
schema.index(
    { identifier: 1, typeOf: 1 }
);

export default mongoose.model('Event', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
