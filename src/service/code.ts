/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as jwt from 'jsonwebtoken';
// import * as uuid from 'uuid';

import { factory } from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';

import * as chevre from '../chevre';

export type IToken = string;
export type IData = any;
export type ICode = string;

/**
 * コードを発行する
 */
export function publish(params: {
    project: factory.project.IProject;
    agent: factory.action.IParticipant;
    recipient: factory.action.IParticipant;
    object: IData[];
    purpose: any;
    validFrom: Date;
    /**
     * コード有効期間(秒)
     */
    expiresInSeconds: number;
}) {
    return async (repos: {
        action: ActionRepo;
        authorization: chevre.service.Authorization;
    }): Promise<factory.authorization.IAuthorization[]> => {
        const actionAttributes: factory.action.authorize.IAttributes<any, any> = {
            project: params.project,
            typeOf: factory.actionType.AuthorizeAction,
            agent: params.agent,
            recipient: params.recipient,
            object: params.object,
            purpose: params.purpose
        };
        const action = await repos.action.start(actionAttributes);

        let authorizations: factory.authorization.IAuthorization[];

        try {
            authorizations = await publishByChevre(params.object.map((o) => {
                return {
                    project: params.project,
                    data: o,
                    validFrom: params.validFrom,
                    expiresInSeconds: Number(params.expiresInSeconds)
                };
            }))(repos);
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

        const result: factory.authorization.IAuthorization[] = authorizations;
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        return authorizations;
    };
}

function publishByChevre(params: {
    project: factory.project.IProject;
    data: IData;
    validFrom: Date;
    expiresInSeconds: number;
}[]) {
    return async (repos: {
        authorization: chevre.service.Authorization;
    }): Promise<factory.authorization.IAuthorization[]> => {
        const saveParams = params.map((p) => {
            // const code = uuid.v4();

            return {
                project: p.project,
                code: 'xxxxx', // 実際はchevre側で発行されるので適当な値でよし
                object: p.data,
                validFrom: p.validFrom,
                expiresInSeconds: p.expiresInSeconds
            };
        });

        return repos.authorization.create(saveParams.map((authorization) => {
            return {
                code: authorization.code,
                object: authorization.object,
                project: { id: authorization.project.id, typeOf: authorization.project.typeOf },
                typeOf: 'Authorization',
                validFrom: authorization.validFrom,
                expiresInSeconds: Number(authorization.expiresInSeconds)
            };
        }));
    };
}

/**
 * コードをトークンに変換する
 */
export function getToken(params: {
    project: factory.project.IProject;
    code: ICode;
    secret: string;
    issuer: string;
    expiresIn: number;
}) {
    return async (repos: {
        authorization: chevre.service.Authorization;
    }): Promise<IToken> => {
        const now = new Date();

        const searchResult = await repos.authorization.search({
            limit: 1,
            project: { id: { $eq: params.project.id } },
            code: { $in: [params.code] },
            validFrom: now,
            validThrough: now
        });
        const authorizationByChevre = searchResult.data.shift();
        if (authorizationByChevre === undefined) {
            throw new factory.errors.NotFound('Authorization');
        }

        const data = authorizationByChevre.object;

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
    issuer: string | string[];
    audience?: string[];
}) {
    return async (repos: {
        action?: ActionRepo;
    }): Promise<T> => {
        let result: T;
        let action: factory.action.check.token.IAction | undefined;

        if (repos.action !== undefined) {
            const actionAttributes: factory.action.check.token.IAttributes = {
                project: params.project,
                typeOf: factory.actionType.CheckAction,
                agent: params.agent,
                object: {
                    token: params.token
                }
            };
            action = await repos.action.start(actionAttributes);
        }

        try {
            result = await new Promise<T>((resolve, reject) => {
                jwt.verify(
                    params.token,
                    params.secret,
                    {
                        issuer: params.issuer,
                        ...(Array.isArray(params.audience)) ? { audience: params.audience } : undefined
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
            if (repos.action !== undefined && action !== undefined) {
                // actionにエラー結果を追加
                try {
                    const actionError = { ...error, message: error.message, name: error.name };
                    await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
                } catch (__) {
                    // 失敗したら仕方ない
                }
            }

            // JWTエラーをハンドリング
            if (error instanceof jwt.TokenExpiredError) {
                throw new factory.errors.Argument('token', `${error.message} expiredAt:${error.expiredAt}`);
            }

            throw error;
        }

        if (repos.action !== undefined && action !== undefined) {
            await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
        }

        return result;
    };
}
