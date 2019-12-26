import * as mongoose from 'mongoose';

const modelName = 'Action';

const writeConcern: mongoose.WriteConcern = { j: true, w: 'majority', wtimeout: 10000 };

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

/**
 * アクションスキーマ
 */
const schema = new mongoose.Schema(
    {
        project: mongoose.SchemaTypes.Mixed,
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
        amount: mongoose.SchemaTypes.Mixed,
        fromLocation: mongoose.SchemaTypes.Mixed,
        toLocation: mongoose.SchemaTypes.Mixed,
        instrument: mongoose.SchemaTypes.Mixed
    },
    {
        collection: 'actions',
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
    { 'project.id': 1, startDate: -1 },
    {
        name: 'searchByProjectId',
        partialFilterExpression: {
            'project.id': { $exists: true }
        }
    }
);

schema.index(
    { typeOf: 1, startDate: -1 },
    { name: 'searchByTypeOf-v2' }
);

schema.index(
    { actionStatus: 1, startDate: -1 },
    { name: 'searchByActionStatus-v2' }
);

schema.index(
    { startDate: -1 },
    { name: 'searchByStartDate-v2' }
);

schema.index(
    { endDate: -1, startDate: -1 },
    {
        name: 'searchByEndDate-v2',
        partialFilterExpression: {
            endDate: { $exists: true }
        }
    }
);

schema.index(
    { 'purpose.typeOf': 1, startDate: -1 },
    {
        name: 'searchByPurposeTypeOf-v2',
        partialFilterExpression: {
            'purpose.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'purpose.id': 1, startDate: -1 },
    {
        name: 'searchByPurposeId-v2',
        partialFilterExpression: {
            'purpose.id': { $exists: true }
        }
    }
);

schema.index(
    { 'object.typeOf': 1, startDate: -1 },
    {
        name: 'searchByObjectTypeOf-v2',
        partialFilterExpression: {
            'object.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'object.orderNumber': 1, startDate: -1 },
    {
        name: 'searchByObjectOrderNumber-v2',
        partialFilterExpression: {
            'object.orderNumber': { $exists: true }
        }
    }
);

schema.index(
    { 'purpose.orderNumber': 1, startDate: -1 },
    {
        name: 'searchByPurposeOrderNumber-v2',
        partialFilterExpression: {
            'purpose.orderNumber': { $exists: true }
        }
    }
);

schema.index(
    { 'object.paymentMethod.paymentMethodId': 1, startDate: -1 },
    {
        name: 'searchByObjectPaymentMethodPaymentMethodId',
        partialFilterExpression: {
            'object.paymentMethod.paymentMethodId': { $exists: true }
        }
    }
);

schema.index(
    { 'object.event.id': 1, startDate: -1 },
    {
        name: 'searchByObjectEventId',
        partialFilterExpression: {
            'object.event.id': { $exists: true }
        }
    }
);

schema.index(
    { 'object.acceptedOffer.ticketedSeat.seatNumber': 1, startDate: -1 },
    {
        name: 'searchByObjectAcceptedOfferTicketedSeatSeatNumber',
        partialFilterExpression: {
            'object.acceptedOffer.ticketedSeat.seatNumber': { $exists: true }
        }
    }
);

schema.index(
    { 'result.typeOf': 1, startDate: -1 },
    {
        name: 'searchByResultTypeOf',
        partialFilterExpression: {
            'result.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'result.id': 1, startDate: -1 },
    {
        name: 'searchByResultId',
        partialFilterExpression: {
            'result.id': { $exists: true }
        }
    }
);

schema.index(
    { 'fromLocation.typeOf': 1, startDate: -1 },
    {
        name: 'searchByFromLocationTypeOf',
        partialFilterExpression: {
            'fromLocation.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'fromLocation.accountNumber': 1, startDate: -1 },
    {
        name: 'searchByFromLocationAccountNumber',
        partialFilterExpression: {
            'fromLocation.accountNumber': { $exists: true }
        }
    }
);

schema.index(
    { 'fromLocation.accountType': 1, startDate: -1 },
    {
        name: 'searchByFromLocationAccountType',
        partialFilterExpression: {
            'fromLocation.accountType': { $exists: true }
        }
    }
);

schema.index(
    { 'toLocation.typeOf': 1, startDate: -1 },
    {
        name: 'searchByToLocationTypeOf',
        partialFilterExpression: {
            'toLocation.typeOf': { $exists: true }
        }
    }
);

schema.index(
    { 'toLocation.accountNumber': 1, startDate: -1 },
    {
        name: 'searchByToLocationAccountNumber',
        partialFilterExpression: {
            'toLocation.accountNumber': { $exists: true }
        }
    }
);

schema.index(
    { 'toLocation.accountType': 1, startDate: -1 },
    {
        name: 'searchByToLocationAccountType',
        partialFilterExpression: {
            'toLocation.accountType': { $exists: true }
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
