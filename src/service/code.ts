/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as jwt from 'jsonwebtoken';

import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { ICode, IData, MongoRepository as CodeRepo } from '../repo/code';
import { MongoRepository as ProjectRepo } from '../repo/project';

const DEFAULT_CODE_EXPIRES_IN_SECONDS = 600;

export type IToken = string;

/**
 * コードを発行する
 */
export function publish(params: {
    project: factory.project.IProject;
    agent: factory.action.IParticipant;
    recipient: factory.action.IParticipant;
    object: IData;
    purpose: any;
    validFrom: Date;
}) {
    return async (repos: {
        action: ActionRepo;
        code: CodeRepo;
        project: ProjectRepo;
    }): Promise<factory.authorization.IAuthorization> => {
        const project = await repos.project.findById({ id: params.project.id });
        const expiresInSeconds = (project.settings !== undefined && typeof project.settings.codeExpiresInSeconds === 'number')
            ? project.settings.codeExpiresInSeconds
            : DEFAULT_CODE_EXPIRES_IN_SECONDS;

        const actionAttributes: factory.action.authorize.IAttributes<any, any> = {
            project: params.project,
            typeOf: factory.actionType.AuthorizeAction,
            agent: params.agent,
            recipient: params.recipient,
            object: params.object,
            purpose: params.purpose
        };
        const action = await repos.action.start(actionAttributes);

        let authorization: factory.authorization.IAuthorization;

        try {
            authorization = await repos.code.publish({
                project: params.project,
                data: params.object,
                validFrom: params.validFrom,
                expiresInSeconds: expiresInSeconds
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            // JWTエラーをハンドリング
            if (error instanceof jwt.TokenExpiredError) {
                throw new factory.errors.Argument('token', `${error.message} expiredAt:${error.expiredAt}`);
            }

            throw error;
        }

        const result: factory.authorization.IAuthorization = authorization;
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        return authorization;
    };
}

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

            // JWTエラーをハンドリング
            if (error instanceof jwt.TokenExpiredError) {
                throw new factory.errors.Argument('token', `${error.message} expiredAt:${error.expiredAt}`);
            }

            throw error;
        }
        await repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });

        return result;
    };
}
