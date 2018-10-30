import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const agentSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const recipientSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const errorSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const objectSchema = mongoose.SchemaTypes.Mixed;
const resultSchema = mongoose.SchemaTypes.Mixed;
const purposeSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const potentialActionsSchema = new mongoose.Schema(
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

/**
 * アクションスキーマ
 */
const schema = new mongoose.Schema(
    {
        actionStatus: String,
        typeOf: String,
        agent: agentSchema,
        recipient: recipientSchema,
        result: resultSchema,
        error: errorSchema,
        object: objectSchema,
        startDate: Date,
        endDate: Date,
        purpose: purposeSchema,
        potentialActions: potentialActionsSchema,
        amount: Number,
        fromLocation: locationSchema,
        toLocation: locationSchema
    },
    {
        collection: 'actions',
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
    { typeOf: 1 },
    { name: 'searchByTypeOf' }
);
schema.index(
    { startDate: 1 },
    { name: 'searchByStartDate' }
);
schema.index(
    { 'purpose.id': 1 },
    {
        name: 'searchByPurposeId',
        partialFilterExpression: {
            'purpose.id': { $exists: true }
        }
    }
);
schema.index(
    { 'object.typeOf': 1 },
    {
        name: 'searchByObjectTypeOf',
        partialFilterExpression: {
            'object.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'object.orderNumber': 1 },
    {
        name: 'searchByObjectOrderNumber',
        partialFilterExpression: {
            'object.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'purpose.orderNumber': 1 },
    {
        name: 'searchByPurposeOrderNumber',
        partialFilterExpression: {
            'purpose.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'object.paymentMethod.paymentMethodId': 1 },
    {
        name: 'searchByObjectPaymentMethodId',
        partialFilterExpression: {
            'object.paymentMethod.paymentMethodId': { $exists: true }
        }
    }
);

export default mongoose.model('Action', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
