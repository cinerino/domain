/**
 * 通知サービス
 */
// tslint:disable-next-line:no-implicit-dependencies no-submodule-imports
import { MailData } from '@sendgrid/helpers/classes/mail';
// tslint:disable-next-line:no-require-imports
import sgMail = require('@sendgrid/mail');
import * as createDebug from 'debug';
import { ACCEPTED, CREATED, NO_CONTENT, OK } from 'http-status';
import * as request from 'request';
import * as util from 'util';
import * as validator from 'validator';

import { credentials } from '../credentials';

import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';

export type Operation<T> = () => Promise<T>;

const debug = createDebug('cinerino-domain:service');

/**
 * Eメールメッセージを送信する
 * @see https://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/errors.html
 */
export function sendEmailMessage(actionAttributes: factory.action.transfer.send.message.email.IAttributes) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(actionAttributes);
        let result: any = {};

        try {
            sgMail.setApiKey(credentials.sendGrid.apiKey);
            const emailMessage = actionAttributes.object;
            const msg: MailData = {
                to: {
                    name: emailMessage.toRecipient.name,
                    email: emailMessage.toRecipient.email
                },
                from: {
                    name: emailMessage.sender.name,
                    email: emailMessage.sender.email
                },
                ...(String(emailMessage.about).length > 0) ? { subject: String(emailMessage.about) } : {},
                ...(String(emailMessage.text).length > 0) ? { text: String(emailMessage.text) } : {},
                // html: '<strong>and easy to do anywhere, even with Node.js</strong>',
                // categories: ['Transactional', 'My category'],
                // 送信予定を追加することもできるが、タスクの実行予定日時でコントロールする想定
                // sendAt: moment(email.send_at).unix(),
                // 追跡用に通知IDをカスタムフィールドとしてセットする
                customArgs: {
                    emailMessage: emailMessage.identifier
                }
            };

            debug('requesting sendgrid api...', msg);
            const response = await sgMail.send(msg);
            debug('email sent. status code:', response[0].statusCode);

            // check the response.
            if (response[0].statusCode !== ACCEPTED) {
                throw new Error(`sendgrid request not accepted. response is ${util.inspect(response)}`);
            }

            result = response[0].body;
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: actionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });
    };
}

/**
 * 開発者に報告する
 * @see https://notify-bot.line.me/doc/ja/
 */
export function report2developers(subject: string, content: string, imageThumbnail?: string, imageFullsize?: string): Operation<void> {
    return async () => {
        const LINE_NOTIFY_URL = credentials.lineNotify.url;
        const LINE_NOTIFY_ACCESS_TOKEN = credentials.lineNotify.accessToken;
        if (LINE_NOTIFY_URL === undefined) {
            throw new Error('Environment variable LINE_NOTIFY_URL not set');
        }
        if (LINE_NOTIFY_ACCESS_TOKEN === undefined) {
            throw new Error('Environment variable LINE_NOTIFY_ACCESS_TOKEN not set');
        }

        const message = `
env[${process.env.NODE_ENV}]
------------------------
${subject}
------------------------
${content}`
            ;

        // LINE通知APIにPOST
        const formData: any = { message: message };
        if (imageThumbnail !== undefined) {
            if (!validator.isURL(imageThumbnail)) {
                throw new factory.errors.Argument('imageThumbnail', 'imageThumbnail should be URL');
            }

            formData.imageThumbnail = imageThumbnail;
        }
        if (imageFullsize !== undefined) {
            if (!validator.isURL(imageFullsize)) {
                throw new factory.errors.Argument('imageFullsize', 'imageFullsize should be URL');
            }

            formData.imageFullsize = imageFullsize;
        }

        return new Promise<void>((resolve, reject) => {
            request.post(
                {
                    url: LINE_NOTIFY_URL,
                    auth: { bearer: LINE_NOTIFY_ACCESS_TOKEN },
                    form: formData,
                    json: true
                },
                (error, response, body) => {
                    debug('posted to LINE Notify.', error, body);
                    if (error !== null) {
                        reject(error);
                    } else {
                        switch (response.statusCode) {
                            case OK:
                                resolve();
                                break;
                            default:
                                reject(new Error(body.message));
                        }
                    }
                }
            );
        });
    };
}

export function triggerWebhook(params: factory.task.IData<factory.taskName.TriggerWebhook>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);
        let result: any = {};

        try {
            if (params.recipient !== undefined && typeof params.recipient.url === 'string') {
                const url = params.recipient.url;

                await new Promise<void>((resolve, reject) => {
                    request.post(
                        {
                            url: url,
                            body: {
                                data: params.object
                            },
                            json: true
                        },
                        (error, response, body) => {
                            if (error instanceof Error) {
                                reject(error);
                            } else {
                                switch (response.statusCode) {
                                    case OK:
                                    case CREATED:
                                    case ACCEPTED:
                                    case NO_CONTENT:
                                        result = {
                                            statusCode: response.statusCode
                                            // body: body
                                        };
                                        resolve();
                                        break;

                                    default:
                                        reject(body);
                                }
                            }
                        }
                    );
                });
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}
