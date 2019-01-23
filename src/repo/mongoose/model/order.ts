import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const customerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const sellerSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const acceptedOfferSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const paymentMethodSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

const discountSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

/**
 * 注文スキーマ
 */
const schema = new mongoose.Schema(
    {
        typeOf: {
            type: String,
            required: true
        },
        seller: sellerSchema,
        customer: customerSchema,
        confirmationNumber: String,
        orderNumber: String,
        price: Number,
        priceCurrency: String,
        acceptedOffers: [acceptedOfferSchema],
        paymentMethods: [paymentMethodSchema],
        discounts: [discountSchema],
        url: String,
        orderStatus: String,
        orderDate: Date,
        isGift: Boolean,
        dateReturned: Date
    },
    {
        collection: 'orders',
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
// 注文番号はユニークなはず
schema.index(
    { orderNumber: 1 },
    {
        unique: true,
        name: 'uniqueOrderNumber'
    }
);
schema.index(
    { 'seller.id': 1 },
    {
        name: 'searchOrdersBySeller',
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);
schema.index(
    { orderDate: 1 },
    {
        name: 'searchOrdersByOrderDate'
    }
);
schema.index(
    { orderStatus: 1 },
    {
        name: 'searchOrdersByOrderStatus'
    }
);
schema.index(
    { confirmationNumber: 1 },
    {
        name: 'searchOrdersByConfirmationNumber',
        partialFilterExpression: {
            confirmationNumber: { $exists: true }
        }
    }
);
schema.index(
    { 'customer.typeOf': 1 },
    {
        name: 'searchByCustomerTypeOf',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.id': 1 },
    {
        name: 'searchByCustomerId',
        partialFilterExpression: {
            'customer.id': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.identifier': 1 },
    {
        name: 'searchByCustomerIdentifier',
        partialFilterExpression: {
            'customer.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.memberOf.membershipNumber': 1 },
    {
        name: 'searchByCustomerMemberhipNumber',
        partialFilterExpression: {
            'customer.memberOf.membershipNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.givenName': 1 },
    {
        name: 'searchByCustomerGivenName',
        partialFilterExpression: {
            'customer.givenName': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.familyName': 1 },
    {
        name: 'searchByCustomerFamilyName',
        partialFilterExpression: {
            'customer.familyName': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.email': 1 },
    {
        name: 'searchByCustomerEmail',
        partialFilterExpression: {
            'customer.email': { $exists: true }
        }
    }
);
schema.index(
    { 'customer.telephone': 1 },
    {
        name: 'searchByCustomerTelephone',
        partialFilterExpression: {
            'customer.telephone': { $exists: true }
        }
    }
);
schema.index(
    { 'paymentMethods.typeOf': 1 },
    {
        name: 'searchByPaymentMethodType',
        partialFilterExpression: {
            'paymentMethods.typeOf': { $exists: true }
        }
    }
);
schema.index(
    { 'paymentMethods.paymentMethodId': 1 },
    {
        name: 'searchByPaymentMethodId',
        partialFilterExpression: {
            'paymentMethods.paymentMethodId': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.id': 1 },
    {
        name: 'searchByItemOfferedId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationNumber': 1 },
    {
        name: 'searchByItemOfferedReservationNumber',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.id': 1 },
    {
        name: 'searchByItemOfferedReservationForId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.identifier': 1 },
    {
        name: 'searchByItemOfferedReservationForIdentifier',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.identifier': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.name': 1 },
    {
        name: 'searchByItemOfferedReservationForName',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.name': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.endDate': 1 },
    {
        name: 'searchByItemOfferedReservationForEndDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.endDate': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.startDate': 1 },
    {
        name: 'searchByItemOfferedReservationForStartDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.startDate': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.location.branchCode': 1 },
    {
        name: 'searchByItemOfferedReservationForLocationBranchCode',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.id': 1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.id': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': 1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventLocationBranchCode',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    { 'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': 1 },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventWorkPerformedIdentifier',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': { $exists: true }
        }
    }
);

export default mongoose.model('Order', schema)
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
