import * as mongoose from 'mongoose';

import * as factory from '../../../factory';

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

const resultSchema = new mongoose.Schema(
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

const objectSchema = new mongoose.Schema(
    {},
    {
        id: false,
        _id: false,
        strict: false
    }
);

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
    { typeOf: 1, _id: 1 }
);

// 取引の承認アクション検索に使用
schema.index(
    { typeOf: 1, 'purpose.id': 1 },
    {
        partialFilterExpression: {
            'purpose.id': { $exists: true }
        }
    }
);

// 取引の承認アクション状態変更に使用
schema.index(
    { 'object.typeOf': 1, 'purpose.id': 1, typeOf: 1, _id: 1 },
    {
        partialFilterExpression: {
            'object.typeOf': { $exists: true },
            'purpose.id': { $exists: true }
        }
    }
);

// 注文に対するアクション検索に使用
schema.index(
    { 'object.orderNumber': 1 },
    {
        partialFilterExpression: {
            'object.orderNumber': { $exists: true }
        }
    }
);
schema.index(
    { 'purpose.orderNumber': 1 },
    {
        partialFilterExpression: {
            'purpose.orderNumber': { $exists: true }
        }
    }
);

// GMOオーダーIDから支払アクションを検索する際に使用
schema.index(
    { 'object.paymentMethod.paymentMethodId': 1 },
    {
        partialFilterExpression: {
            typeOf: factory.actionType.PayAction,
            'object.paymentMethod.paymentMethodId': { $exists: true }
        }
    }
);

// 取引調査や、アクション集計などで、アクションを検索することはとても多いので、そのためのインデックス
schema.index(
    { typeOf: 1, 'object.typeOf': 1, startDate: 1 }
);

// イベントに対する座席仮予約アクション検索時に使用
schema.index(
    { typeOf: 1, 'object.typeOf': 1, 'object.screeningEvent.id': 1 },
    {
        name: 'searchSeatReservationAuthorizeActionByEvent',
        partialFilterExpression: {
            'object.typeOf': factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation
        }
    }
);

// イベントと座席指定で座席仮予約アクション検索時に使用
schema.index(
    { typeOf: 1, 'object.typeOf': 1, 'object.screeningEvent.id': 1, 'object.offers.seatNumber': 1 },
    {
        name: 'searchSeatReservationAuthorizeActionByEventAndSeat',
        partialFilterExpression: {
            'object.typeOf': factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation
        }
    }
);

// GMOオーダーIDから承認アクション検索時に使用
schema.index(
    { typeOf: 1, 'object.typeOf': 1, 'object.orderId': 1 },
    {
        name: 'searchCreditCardAuthorizeActionByOrderId',
        partialFilterExpression: {
            'object.typeOf': factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard
        }
    }
);

// ムビチケ購入管理番号から承認アクション検索時に使用
// schema.index(
//     { typeOf: 1, 'object.typeOf': 1, 'object.seatInfoSyncIn.knyknrNoInfo.knyknrNo': 1 },
//     {
//         name: 'searchMvtkAuthorizeActionByKnyknrNo',
//         partialFilterExpression: {
//             'object.typeOf': factory.action.authorize.discount.mvtk.ObjectType.Mvtk
//         }
//     }
// );

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
