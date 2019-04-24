import * as mongoose from 'mongoose';

import MultilingualStringSchemaType from '../schemaTypes/multilingualString';

const modelName = 'Event';

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

const videoFormatSchema = mongoose.SchemaTypes.Mixed;
const identifierSchema = mongoose.SchemaTypes.Mixed;
const alternativeHeadlineSchema = mongoose.SchemaTypes.Mixed;

/**
 * イベントスキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        _id: String,
        typeOf: {
            type: String,
            required: true
        },
        identifier: identifierSchema,
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
        videoFormat: videoFormatSchema,
        kanaName: String,
        alternativeHeadline: alternativeHeadlineSchema,
        ticketTypeGroup: String,
        maximumAttendeeCapacity: Number,
        remainingAttendeeCapacity: Number
    },
    {
        collection: 'events',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: false, // Chevreの型に柔軟に対応
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
    { 'project.id': 1, startDate: 1 },
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
    { name: 1 },
    { name: 'searchByName' }
);
schema.index(
    { doorTime: 1 },
    {
        name: 'searchByDoorTime',
        partialFilterExpression: {
            doorTime: { $exists: true }
        }
    }
);
schema.index(
    { startDate: 1 },
    { name: 'searchByStartDate' }
);
schema.index(
    { endDate: 1 },
    { name: 'searchByEndDate' }
);
schema.index(
    { eventStatus: 1 },
    { name: 'searchByEventStatus' }
);
schema.index(
    { 'superEvent.id': 1 },
    {
        name: 'searchBySuperEventId',
        partialFilterExpression: {
            'superEvent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.location.branchCode': 1 },
    {
        name: 'searchBySuperEventLocationBranchCode',
        partialFilterExpression: {
            'superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.location.identifier': 1 },
    {
        name: 'searchBySuperEventLocationIdentifier',
        partialFilterExpression: {
            'superEvent.location.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.workPerformed.identifier': 1 },
    {
        name: 'searchBySuperEventWorkPerformedIdentifier',
        partialFilterExpression: {
            'superEvent.workPerformed.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'workPerformed.identifier': 1 },
    {
        name: 'searchByWorkPerformedIdentifier',
        partialFilterExpression: {
            'workPerformed.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.availabilityEnds': 1 },
    {
        name: 'searchByOffersAvailabilityEnds',
        partialFilterExpression: {
            'offers.availabilityEnds': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.availabilityStarts': 1 },
    {
        name: 'searchByOffersAvailabilityStarts',
        partialFilterExpression: {
            'offers.availabilityStarts': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.validThrough': 1 },
    {
        name: 'searchByOffersValidThrough',
        partialFilterExpression: {
            'offers.validThrough': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.validFrom': 1 },
    {
        name: 'searchByOffersValidFrom',
        partialFilterExpression: {
            'offers.validFrom': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.id': 1 },
    {
        name: 'searchByOffersId',
        partialFilterExpression: {
            'offers.id': { $exists: true }
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
