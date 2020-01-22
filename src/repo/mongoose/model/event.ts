import * as mongoose from 'mongoose';

const modelName = 'Event';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

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
        name: mongoose.SchemaTypes.Mixed,
        description: mongoose.SchemaTypes.Mixed,
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
        writeConcern: writeConcern,
        strict: false, // Chevreの型に柔軟に対応
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
            virtuals: false,
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
    { typeOf: 1, startDate: 1 },
    { name: 'searchByTypeOf-v2' }
);
schema.index(
    { identifier: 1, startDate: 1 },
    {
        name: 'searchByIdentifier-v2',
        partialFilterExpression: {
            identifier: { $exists: true }
        }
    }
);
schema.index(
    { name: 1, startDate: 1 },
    { name: 'searchByName-v2' }
);
schema.index(
    { doorTime: 1, startDate: 1 },
    {
        name: 'searchByDoorTime-v2',
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
    { endDate: 1, startDate: 1 },
    { name: 'searchByEndDate-v2' }
);
schema.index(
    { eventStatus: 1, startDate: 1 },
    { name: 'searchByEventStatus-v2' }
);
schema.index(
    { 'superEvent.id': 1, startDate: 1 },
    {
        name: 'searchBySuperEventId-v2',
        partialFilterExpression: {
            'superEvent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.location.branchCode': 1, startDate: 1 },
    {
        name: 'searchBySuperEventLocationBranchCode-v2',
        partialFilterExpression: {
            'superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.location.identifier': 1, startDate: 1 },
    {
        name: 'searchBySuperEventLocationIdentifier-v2',
        partialFilterExpression: {
            'superEvent.location.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'superEvent.workPerformed.identifier': 1, startDate: 1 },
    {
        name: 'searchBySuperEventWorkPerformedIdentifier-v2',
        partialFilterExpression: {
            'superEvent.workPerformed.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'workPerformed.identifier': 1, startDate: 1 },
    {
        name: 'searchByWorkPerformedIdentifier-v2',
        partialFilterExpression: {
            'workPerformed.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.availabilityEnds': 1, startDate: 1 },
    {
        name: 'searchByOffersAvailabilityEnds-v2',
        partialFilterExpression: {
            'offers.availabilityEnds': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.availabilityStarts': 1, startDate: 1 },
    {
        name: 'searchByOffersAvailabilityStarts-v2',
        partialFilterExpression: {
            'offers.availabilityStarts': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.validThrough': 1, startDate: 1 },
    {
        name: 'searchByOffersValidThrough-v2',
        partialFilterExpression: {
            'offers.validThrough': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.validFrom': 1, startDate: 1 },
    {
        name: 'searchByOffersValidFrom-v2',
        partialFilterExpression: {
            'offers.validFrom': { $exists: true }
        }
    }
);
schema.index(
    { 'offers.id': 1, startDate: 1 },
    {
        name: 'searchByOffersId-v2',
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
