/**
 * 通知サービス
 */
import * as factory from '@cinerino/factory';
// tslint:disable-next-line:no-require-imports
import sgMail = require('@sendgrid/mail');
import * as createDebug from 'debug';
import * as httpStatus from 'http-status';
import * as request from 'request';
import * as util from 'util';
import * as validator from 'validator';

import { MongoRepository as ActionRepo } from '../repo/action';

export type Operation<T> = () => Promise<T>;

const debug = createDebug('cinerino-domain:*');

export const LINE_NOTIFY_URL = 'https://notify-api.line.me/api/notify';

/**
 * Eメールメッセージを送信する
 * @param actionAttributes Eメール送信アクション属性
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
            sgMail.setApiKey(<string>process.env.SENDGRID_API_KEY);
            const emailMessage = actionAttributes.object;
            const msg = {
                to: {
                    name: emailMessage.toRecipient.name,
                    email: emailMessage.toRecipient.email
                },
                from: {
                    name: emailMessage.sender.name,
                    email: emailMessage.sender.email
                },
                subject: emailMessage.about,
                text: emailMessage.text,
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
            if (response[0].statusCode !== httpStatus.ACCEPTED) {
                throw new Error(`sendgrid request not accepted. response is ${util.inspect(response)}`);
            }

            result = response[0].body;
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(actionAttributes.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete(actionAttributes.typeOf, action.id, result);
    };
}

/**
 * report to developers
 * 開発者に報告する
 * @see https://notify-bot.line.me/doc/ja/
 */
export function report2developers(subject: string, content: string, imageThumbnail?: string, imageFullsize?: string): Operation<void> {
    return async () => {
        if (process.env.DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN === undefined) {
            throw new Error('access token for LINE Notify undefined');
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
                    auth: { bearer: process.env.DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN },
                    form: formData,
                    json: true
                },
                (error, response, body) => {
                    debug('posted to LINE Notify.', error, body);
                    if (error !== null) {
                        reject(error);
                    } else {
                        if (response.statusCode !== httpStatus.OK) {
                            reject(new Error(body.message));
                        } else {
                            resolve();
                        }
                    }
                }
            );
        });
    };
}
