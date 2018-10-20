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
        isGift: Boolean
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

// 注文番号はユニークなはず
schema.index(
    { orderNumber: 1 },
    {
        unique: true,
        name: 'uniqueOrderNumber'
    }
);

// 会員情報で注文検索
schema.index(
    {
        orderDate: 1,
        'customer.memberOf.membershipNumber': 1,
        'customer.memberOf.programName': 1
    },
    {
        name: 'searchOrdersByProgramMembership',
        partialFilterExpression: {
            'customer.memberOf.membershipNumber': { $exists: true },
            'customer.memberOf.programName': { $exists: true }
        }
    }
);

// 注文検索に使用
schema.index(
    {
        'seller.id': 1
    },
    {
        name: 'searchOrdersBySeller',
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);
// 注文検索に使用
schema.index(
    {
        orderNumber: 1,
        orderStatus: 1,
        orderDate: 1
    },
    {
        name: 'searchOrders'
    }
);
schema.index(
    {
        orderDate: 1
    },
    {
        name: 'searchOrdersByOrderDate'
    }
);
schema.index(
    {
        orderStatus: 1
    },
    {
        name: 'searchOrdersByOrderStatus'
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.id': 1
    },
    {
        name: 'searchOrdersByReservedEvent',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.id': { $exists: true }
        }
    }
);
schema.index(
    {
        confirmationNumber: 1
    },
    {
        name: 'searchOrdersByConfirmationNumber',
        partialFilterExpression: {
            confirmationNumber: { $exists: true }
        }
    }
);
// CustomerIDで検索
schema.index(
    {
        'customer.typeOf': 1,
        'customer.id': 1
    },
    {
        name: 'searchByCustomerId',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true },
            'customer.id': { $exists: true }
        }
    }
);
// Customer識別子で検索
schema.index(
    {
        'customer.typeOf': 1,
        'customer.identifier': 1
    },
    {
        name: 'searchByCustomerIdentifier',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true },
            'customer.identifier': { $exists: true }
        }
    }
);
// CustomerMembershipNumberで検索
schema.index(
    {
        'customer.typeOf': 1,
        'customer.memberOf.membershipNumber': 1
    },
    {
        name: 'searchByCustomerMemberhipNumber',
        partialFilterExpression: {
            'customer.typeOf': { $exists: true },
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
schema.index(
    {
        'paymentMethods.typeOf': 1
    },
    {
        name: 'searchByPaymentMethodType',
        partialFilterExpression: {
            'paymentMethods.typeOf': { $exists: true }
        }
    }
);
schema.index(
    {
        'paymentMethods.paymentMethodId': 1
    },
    {
        name: 'searchByPaymentMethodId',
        partialFilterExpression: {
            'paymentMethods.paymentMethodId': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.id': 1
    },
    {
        name: 'searchByItemOfferedId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.id': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.id': 1
    },
    {
        name: 'searchByItemOfferedReservationForId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.id': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.name': 1
    },
    {
        name: 'searchByItemOfferedReservationForName',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.name': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.endDate': 1
    },
    {
        name: 'searchByItemOfferedReservationForEndDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.endDate': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.startDate': 1
    },
    {
        name: 'searchByItemOfferedReservationForStartDate',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.startDate': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.location.branchCode': 1
    },
    {
        name: 'searchByItemOfferedReservationForLocationBranchCode',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.superEvent.id': 1
    },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventId',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.id': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': 1
    },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventLocationBranchCode',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.location.branchCode': { $exists: true }
        }
    }
);
schema.index(
    {
        'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': 1
    },
    {
        name: 'searchByItemOfferedReservationForLocationSuperEventWorkPerformedIdentifier',
        partialFilterExpression: {
            'acceptedOffers.itemOffered.reservationFor.superEvent.workPerformed.identifier': { $exists: true }
        }
    }
);
export default mongoose.model('Order', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
