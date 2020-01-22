import * as mongoose from 'mongoose';

const modelName = 'OwnershipInfo';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

const ownedBySchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const acquiredFromSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const typeOfGoodSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 所有権スキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
        _id: String,
        typeOf: {
            type: String,
            required: true
        },
        identifier: mongoose.SchemaTypes.Mixed,
        ownedBy: ownedBySchema,
        acquiredFrom: acquiredFromSchema,
        ownedFrom: Date,
        ownedThrough: Date,
        typeOfGood: typeOfGoodSchema
    },
    {
        collection: 'ownershipInfos',
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
    { 'project.id': 1, ownedFrom: -1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, ownedFrom: -1 },
    { name: 'searchByTypeOf-v2' }
);
schema.index(
    { identifier: 1, ownedFrom: -1 },
    {
        name: 'searchByIdentifier-v2',
        partialFilterExpression: {
            identifier: { $exists: true }
        }
    }
);
schema.index(
    { 'acquiredFrom.id': 1, ownedFrom: -1 },
    {
        name: 'searchByAcquiredFromId-v2',
        partialFilterExpression: {
            'acquiredFrom.id': { $exists: true }
        }
    }
);
schema.index(
    { 'typeOfGood.typeOf': 1, ownedFrom: -1 },
    {
        name: 'searchByTypeOfGoodTypeOf-v2',
        partialFilterExpression: {
            'typeOfGood.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'ownedBy.id': 1, ownedFrom: -1 },
    {
        name: 'searchByOwnedById',
        partialFilterExpression: {
            'ownedBy.id': { $exists: true }
        }
    }
);
schema.index(
    { 'ownedBy.memberOf.membershipNumber': 1, ownedFrom: -1 },
    {
        name: 'searchByOwnedByMemberOfMembershipNumber',
        partialFilterExpression: {
            'ownedBy.memberOf.membershipNumber': { $exists: true }
        }
    }
);
schema.index(
    { ownedFrom: -1 },
    {
        name: 'searchByOwnedFrom-v2',
        partialFilterExpression: {
            ownedFrom: { $exists: true }
        }
    }
);
schema.index(
    { ownedThrough: -1, ownedFrom: -1 },
    {
        name: 'searchByOwnedThrough-v2',
        partialFilterExpression: {
            ownedThrough: { $exists: true }
        }
    }
);
schema.index(
    { 'typeOfGood.reservedTicket.ticketToken': 1, ownedFrom: -1 },
    {
        name: 'searchByTypeOfGoofReservedTicketToken',
        partialFilterExpression: {
            'typeOfGood.reservedTicket.ticketToken': { $exists: true }
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
