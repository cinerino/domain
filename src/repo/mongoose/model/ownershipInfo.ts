import * as mongoose from 'mongoose';

const modelName = 'OwnershipInfo';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

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

schema.index(
    { createdAt: 1 },
    { name: 'searchByCreatedAt' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
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
    { 'acquiredFrom.id': 1 },
    {
        name: 'searchByAcquiredFromId',
        partialFilterExpression: {
            'acquiredFrom.id': { $exists: true }
        }
    }
);
schema.index(
    { 'typeOfGood.typeOf': 1 },
    {
        name: 'searchByTypeOfGoodTypeOf',
        partialFilterExpression: {
            'typeOfGood.typeOf': { $exists: true }
        }
    }
);
schema.index(
    {
        'ownedBy.id': 1
    },
    {
        name: 'searchByOwnerId',
        partialFilterExpression: {
            'ownedBy.id': { $exists: true }
        }
    }
);
schema.index(
    {
        'ownedBy.memberOf.membershipNumber': 1
    },
    {
        name: 'searchByOwnerMemberOfMembershipNumber',
        partialFilterExpression: {
            'ownedBy.memberOf.membershipNumber': { $exists: true }
        }
    }
);
schema.index(
    { ownedFrom: 1 },
    {
        name: 'searchByOwnedFrom',
        partialFilterExpression: {
            ownedFrom: { $exists: true }
        }
    }
);
schema.index(
    { ownedThrough: 1 },
    {
        name: 'searchByownedThrough',
        partialFilterExpression: {
            ownedThrough: { $exists: true }
        }
    }
);
schema.index(
    {
        'typeOfGood.reservedTicket.ticketToken': 1
    },
    {
        name: 'searchByTicketToken',
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
