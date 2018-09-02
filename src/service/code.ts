/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as factory from '@cinerino/factory';
import * as jwt from 'jsonwebtoken';

import { MongoRepository as ActionRepo } from '../repo/action';
import { ICode, RedisRepository as CodeRepo } from '../repo/code';

export type IToken = string;
/**
 * コードをトークンに変換する
 */
export function getToken(params: {
    code: ICode;
    secret: string;
    issuer: string;
    expiresIn: number;
}) {
    return async (repos: {
        code: CodeRepo;
    }): Promise<IToken> => {
        const data = await repos.code.findOne({ code: params.code });

        return new Promise<IToken>((resolve, reject) => {
            // 所有権を暗号化する
            jwt.sign(
                data,
                params.secret,
                {
                    issuer: params.issuer,
                    expiresIn: params.expiresIn
                },
                (err, encoded) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve(encoded);
                    }
                }
            );
        });
    };
}
export function verifyToken<T>(params: {
    agent: factory.action.check.token.IAgent;
    token: string;
    secret: string;
    issuer: string;
}) {
    return async (repos: {
        action: ActionRepo;
    }): Promise<T> => {
        const actionAttributes: factory.action.check.token.IAttributes = {
            typeOf: factory.actionType.CheckAction,
            agent: params.agent,
            object: {
                token: params.token
            }
        };
        const action = await repos.action.start(actionAttributes);
        let result: T;
        try {
            result = await new Promise<T>((resolve, reject) => {
                jwt.verify(
                    params.token,
                    params.secret,
                    {
                        issuer: params.issuer
                    },
                    (err, decoded: any) => {
                        if (err instanceof Error) {
                            reject(err);
                        } else {
                            resolve(decoded);
                        }
                    });
            });
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
        await repos.action.complete(actionAttributes.typeOf, action.id, result);

        return result;
    };
}
