import * as mongoose from 'mongoose';

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
// 所有権検索時に使用
schema.index(
    {
        'typeOfGood.typeOf': 1,
        'ownedBy.id': 1,
        ownedFrom: 1,
        ownedThrough: 1
    },
    {
        name: 'searchByOwner',
        partialFilterExpression: {
            'ownedBy.id': { $exists: true }
        }
    }
);

// トークンで所有権検索時に使用
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

export default mongoose.model('OwnershipInfo', schema)
    .on(
        'index',
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore next */
        (error) => {
            if (error !== undefined) {
                console.error(error);
            }
        }
    );
