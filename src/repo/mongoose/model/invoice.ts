import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const modelName = 'Invoice';

const brokerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const customerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const providerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);
const orderSchema = new mongoose.Schema(
    {
        orderNumber: String
    },
    {
        id: false,
        _id: false,
        strict: false
    }
);
const totalPaymentDueSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 請求書スキーマ
 */
const schema = new mongoose.Schema(
    {
        typeOf: {
            type: String,
            required: true
        },
        accountId: String,
        billingPeriod: String,
        broker: brokerSchema,
        category: String,
        confirmationNumber: String,
        customer: customerSchema,
        // minimumPaymentDue: minimumPaymentDueSchema,
        paymentDueDate: Date,
        paymentMethod: String,
        paymentMethodId: String,
        paymentStatus: String,
        provider: providerSchema,
        referencesOrder: orderSchema,
        scheduledPaymentDate: Date,
        totalPaymentDue: totalPaymentDueSchema
    },
    {
        collection: 'invoices',
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
    { createdAt: -1 },
    { name: 'searchByCreatedAt-v2' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
);

schema.index(
    { 'referencesOrder.orderNumber': 1, createdAt: -1 },
    {
        name: 'searchByReferenceOrderNumber-v2',
        partialFilterExpression: {
            'referencesOrder.orderNumber': { $exists: true }
        }
    }
);

schema.index(
    { paymentMethod: 1, createdAt: -1 },
    {
        name: 'searchByPaymentMethod-v2',
        partialFilterExpression: {
            paymentMethod: { $exists: true }
        }
    }
);

schema.index(
    { paymentMethodId: 1, createdAt: -1 },
    {
        name: 'searchByPaymentMethodId-v2',
        partialFilterExpression: {
            paymentMethodId: { $exists: true }
        }
    }
);

schema.index(
    { paymentStatus: 1, createdAt: -1 },
    {
        name: 'searchByPaymentStatus-v2',
        partialFilterExpression: {
            paymentStatus: { $exists: true }
        }
    }
);

schema.index(
    { accountId: 1, createdAt: -1 },
    {
        name: 'searchByAccountId-v2',
        partialFilterExpression: {
            accountId: { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.typeOf': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerTypeOf-v2',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.id': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerId-v2',
        partialFilterExpression: {
            'customer.id': { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.identifier': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerIdentifier-v2',
        partialFilterExpression: {
            'customer.identifier': { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.memberOf.membershipNumber': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerMemberOfMemberhipNumber',
        partialFilterExpression: {
            'customer.memberOf.membershipNumber': { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.email': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerEmail',
        partialFilterExpression: {
            'customer.email': { $exists: true }
        }
    }
);

schema.index(
    {
        'customer.telephone': 1,
        createdAt: -1
    },
    {
        name: 'searchByCustomerTelephone-v2',
        partialFilterExpression: {
            'customer.telephone': { $exists: true }
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
