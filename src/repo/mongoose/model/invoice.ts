import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

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
        // minimumPaymentDue: String,
        paymentDueDate: Date,
        paymentMethod: String,
        paymentMethodId: String,
        paymentStatus: String,
        provider: providerSchema,
        referencesOrder: orderSchema,
        scheduledPaymentDate: Date
        // totalPaymentDue: String
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
    { createdAt: 1 },
    { name: 'searchByCreatedAt' }
);
schema.index(
    { updatedAt: 1 },
    { name: 'searchByUpdatedAt' }
);
schema.index(
    { 'referencesOrder.orderNumber': 1 },
    {
        name: 'searchByReferenceOrderNumber',
        partialFilterExpression: {
            'referencesOrder.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { paymentMethod: 1 },
    {
        name: 'searchByPaymentMethod',
        partialFilterExpression: {
            paymentMethod: { $exists: true }
        }
    }
);
schema.index(
    { paymentMethodId: 1 },
    {
        name: 'searchByPaymentMethodId',
        partialFilterExpression: {
            paymentMethodId: { $exists: true }
        }
    }
);
schema.index(
    { paymentStatus: 1 },
    {
        name: 'searchByPaymentStatus',
        partialFilterExpression: {
            paymentStatus: { $exists: true }
        }
    }
);
schema.index(
    { accountId: 1 },
    {
        name: 'searchByAccountId',
        partialFilterExpression: {
            accountId: { $exists: true }
        }
    }
);
schema.index(
    {
        'customer.typeOf': 1
    },
    {
        name: 'searchByCustomerTypeOf',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true }
        }
    }
);
schema.index(
    {
        'customer.id': 1
    },
    {
        name: 'searchByCustomerId',
        partialFilterExpression: {
            'customer.id': { $exists: true }
        }
    }
);
schema.index(
    {
        'customer.identifier': 1
    },
    {
        name: 'searchByCustomerIdentifier',
        partialFilterExpression: {
            'customer.identifier': { $exists: true }
        }
    }
);
schema.index(
    {
        'customer.memberOf.membershipNumber': 1
    },
    {
        name: 'searchByCustomerMemberhipNumber',
        partialFilterExpression: {
            'customer.memberOf.membershipNumber': { $exists: true }
        }
    }
);
schema.index(
    {
        'customer.telephone': 1
    },
    {
        name: 'searchByCustomerTelephone',
        partialFilterExpression: {
            'customer.telephone': { $exists: true }
        }
    }
);

export default mongoose.model('Invoice', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
