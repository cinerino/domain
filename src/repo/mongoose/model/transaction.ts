import * as factory from '@cinerino/factory';
import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

const objectSchema = new mongoose.Schema(
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

const agentSchema = new mongoose.Schema(
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

const errorSchema = new mongoose.Schema(
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
 * 取引スキーマ
 */
const schema = new mongoose.Schema(
    {
        status: String,
        typeOf: String,
        agent: agentSchema,
        seller: sellerSchema,
        error: errorSchema,
        result: resultSchema,
        object: objectSchema,
        expires: Date,
        startDate: Date,
        endDate: Date,
        tasksExportedAt: Date,
        tasksExportationStatus: String,
        potentialActions: potentialActionsSchema
    },
    {
        collection: 'transactions',
        id: true,
        read: 'primaryPreferred',
        safe: safe,
        strict: true,
        useNestedStrict: true,
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        toJSON: { getters: true },
        toObject: { getters: true }
    }
);

// タスクエクスポート時の検索で使用
schema.index(
    { tasksExportationStatus: 1, status: 1, typeOf: 1 }
);

// 取引期限切れ確認等に使用
schema.index(
    { status: 1, expires: 1 }
);

// 実行中タスクエクスポート監視に使用
schema.index(
    { tasksExportationStatus: 1, updatedAt: 1 }
);

// 取引進行中は、基本的にIDとステータスで参照する
schema.index(
    { status: 1, typeOf: 1, _id: 1 }
);

// 許可証でユニークに
schema.index(
    {
        'object.passportToken': 1
    },
    {
        unique: true,
        partialFilterExpression: {
            'object.passportToken': { $exists: true }
        }
    }
);

// 結果の注文番号はユニークなはず
schema.index(
    {
        'result.order.orderNumber': 1
    },
    {
        unique: true,
        partialFilterExpression: {
            'result.order.orderNumber': { $exists: true }
        }
    }
);

schema.index(
    {
        typeOf: 1,
        'result.order.orderNumber': 1
    },
    {
        partialFilterExpression: {
            'result.order.orderNumber': { $exists: true }
        }
    }
);

// レポート作成時に使用
schema.index({ typeOf: 1, startDate: 1 });
schema.index(
    { typeOf: 1, endDate: 1 },
    {
        partialFilterExpression: {
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { typeOf: 1, 'seller.id': 1, startDate: 1, endDate: 1 },
    {
        partialFilterExpression: {
            'seller.id': { $exists: true },
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { typeOf: 1, status: 1, 'seller.id': 1, startDate: 1 },
    {
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);
schema.index(
    { typeOf: 1, status: 1, 'seller.id': 1, endDate: 1 },
    {
        partialFilterExpression: {
            'seller.id': { $exists: true },
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { 'seller.id': 1, typeOf: 1, endDate: 1 },
    {
        partialFilterExpression: {
            'seller.id': { $exists: true },
            endDate: { $exists: true }
        }
    }
);
schema.index(
    { 'seller.id': 1, typeOf: 1, startDate: 1 },
    {
        partialFilterExpression: {
            'seller.id': { $exists: true }
        }
    }
);

// 取引タイプ指定で取得する場合に使用
schema.index(
    {
        typeOf: 1,
        _id: 1
    }
);

// ひとつの注文取引に対する確定返品取引はユニークなはず
schema.index(
    {
        'object.transaction.id': 1
    },
    {
        unique: true,
        partialFilterExpression: {
            typeOf: factory.transactionType.ReturnOrder, // 返品取引
            status: factory.transactionStatusType.Confirmed, // 確定ステータス
            'object.transaction.id': { $exists: true }
        }
    }
);

// イベント識別子で注文取引検索する際に使用
schema.index(
    {
        typeOf: 1,
        status: 1,
        'result.order.acceptedOffers.itemOffered.reservationFor.id': 1
    },
    {
        name: 'searchPlaceOrderByEvent',
        partialFilterExpression: {
            'result.order.acceptedOffers.itemOffered.reservationFor.id': { $exists: true }
        }
    }
);

export default mongoose.model('Transaction', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
