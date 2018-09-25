import * as mongoose from 'mongoose';

const safe = { j: true, w: 'majority', wtimeout: 10000 };

/**
 * SendGridイベントスキーマ
 */
const schema = new mongoose.Schema(
    {
        notification: String, // domain.通知ID
        status: String,
        // recommend that you use some form of deduplication
        // when processing or storing your Event Webhook data using the sg_event_id as a differentiator,
        // since this ID is unique for every event.
        sg_event_id: String,
        sg_message_id: String,
        event: String, // One of: bounce, deferred, delivered, dropped, processed
        email: String, // Email address of the intended recipient
        timestamp: Number, // UNIX timestamp
        'smtp-id': String, // An id attached to the message by the originating system
        category: [String],
        asm_group_id: Number,
        reason: String,
        type: String,
        ip: String, // Which IP address was used to send the email.
        tls: String, // Whether or not TLS was used when sending the email.
        cert_err: String, // Whether there was a certificate error on the receiving side.
        useragent: String, // The user agent responsible for the event
        url: String,
        url_offset: {
            type: {
                _id: false,
                index: Number,
                type: String
            }
        },
        response: String,
        send_at: Number
    },
    {
        collection: 'sendGridEvents',
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

schema.index({ sg_event_id: 1 });

export default mongoose.model('SendGridEvent', schema).on(
    'index',
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    (error) => {
        if (error !== undefined) {
            console.error(error);
        }
    }
);
