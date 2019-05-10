/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as jwt from 'jsonwebtoken';

import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { ICode, MongoRepository as CodeRepo, RedisRepository as TemporaryCodeRepo } from '../repo/code';

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
        code: CodeRepo | TemporaryCodeRepo;
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
    project: factory.project.IProject;
    agent: factory.action.check.token.IAgent;
    token: string;
    secret: string;
    issuer: string;
}) {
    return async (repos: {
        action: ActionRepo;
    }): Promise<T> => {
        const actionAttributes: factory.action.check.token.IAttributes = {
            project: params.project,
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
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: actionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }
        await repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });

        return result;
    };
}
