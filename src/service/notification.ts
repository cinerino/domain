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

import { credentials } from '../credentials';

import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as ProjectRepo } from '../repo/project';

export type Operation<T> = () => Promise<T>;

const debug = createDebug('cinerino-domain:service');

// tslint:disable-next-line:no-magic-numbers
const TRIGGER_WEBHOOK_TIMEOUT = (process.env.TRIGGER_WEBHOOK_TIMEOUT !== undefined) ? Number(process.env.TRIGGER_WEBHOOK_TIMEOUT) : 15000;

/**
 * Eメールメッセージを送信する
 * @see https://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/errors.html
 */
export function sendEmailMessage(params: factory.action.transfer.send.message.email.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // アクション開始
        const action = await repos.action.start(params);
        let result: any = {};

        try {
            let apiKey = credentials.sendGrid.apiKey;
            // プロジェクト固有のSendGrid設定があれば、そちらを使用
            if (typeof project.settings?.sendgridApiKey === 'string' && project.settings.sendgridApiKey.length > 0) {
                apiKey = project.settings.sendgridApiKey;
            }
            if (typeof apiKey !== 'string') {
                throw new factory.errors.ServiceUnavailable('API Key not found');
            }

            sgMail.setApiKey(apiKey);
            const emailMessage = params.object;
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
                    emailMessage: emailMessage.identifier,
                    actionId: action.id,
                    projectId: project.id
                }
            };

            const response = await sgMail.send(msg);

            // check the response.
            if (response[0].statusCode !== ACCEPTED) {
                throw new Error(`sendgrid request not accepted. response is ${util.inspect(response)}`);
            }

            result = response[0].body;
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

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
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

        const message = `NODE_ENV[${process.env.NODE_ENV}]
--------
${subject}
--------
${content}`
            ;

        // LINE通知APIにPOST
        const formData: any = {
            message: message,
            ...(typeof imageThumbnail === 'string') ? { imageThumbnail } : undefined,
            ...(typeof imageFullsize === 'string') ? { imageFullsize } : undefined
        };

        return new Promise<void>((resolve, reject) => {
            request.post(
                {
                    url: LINE_NOTIFY_URL,
                    auth: { bearer: LINE_NOTIFY_ACCESS_TOKEN },
                    form: formData,
                    json: true,
                    timeout: TRIGGER_WEBHOOK_TIMEOUT
                },
                (error, response, body) => {
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
            if (typeof params.recipient?.url === 'string') {
                const url = params.recipient.url;

                await new Promise<void>((resolve, reject) => {
                    request.post(
                        {
                            url: url,
                            body: {
                                data: params.object
                            },
                            json: true,
                            timeout: TRIGGER_WEBHOOK_TIMEOUT
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
                                        reject({
                                            statusCode: response.statusCode,
                                            body: body
                                        });
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
