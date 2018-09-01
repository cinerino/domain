/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as factory from '@cinerino/factory';
import * as jwt from 'jsonwebtoken';
import * as uuid from 'uuid';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as CodeRepo } from '../repo/code';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

/**
 * コード発行
 * 所有権をコードに変換する
 */
export function publish<T extends factory.ownershipInfo.IGoodType>(params: {
    ownedBy: { id: string };
    typeOfGood: factory.ownershipInfo.Identifier<T>;
}) {
    return async (repos: {
        code: CodeRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const ownershipInfos = await repos.ownershipInfo.search({
            ownedBy: params.ownedBy,
            typeOfGood: params.typeOfGood
        });
        if (ownershipInfos.length === 0) {
            throw new factory.errors.NotFound('OwnershipInfo');
        }
        const ownershipInfo = ownershipInfos[0];
        const code = uuid.v4();
        await repos.code.save({ code: code, data: ownershipInfo });

        return code;
    };
}
/**
 * コード検証
 * コードの有効性を確認し、所有権トークンを発行する
 */
export function getToken(params: {
    code: string;
    secret: string;
    issuer: string;
    expiresIn: number;
}) {
    return async (repos: {
        code: CodeRepo;
    }) => {
        const ownershipInfo = await repos.code.findOne(params.code);

        return new Promise<string>((resolve, reject) => {
            // 所有権を暗号化する
            jwt.sign(
                ownershipInfo,
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
        let result: any;
        try {
            result = await new Promise<any>((resolve, reject) => {
                jwt.verify(
                    params.token,
                    params.secret,
                    {
                        issuer: params.issuer
                    },
                    (err, decoded) => {
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
