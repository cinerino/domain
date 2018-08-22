/**
 * コード(所有権をpublicにするもの)サービス
 */
import * as factory from '@cinerino/factory';
import * as jwt from 'jsonwebtoken';
import * as uuid from 'uuid';

import { RedisRepository as CodeRepo } from '../repo/code';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

/**
 * コード発行
 * 所有権をコードに変換する
 */
export function publish(params: {
    goodType: factory.ownershipInfo.IGoodType;
    identifier: string;
}) {
    return async (repos: {
        code: CodeRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const ownershipInfos = await repos.ownershipInfo.search({
            goodType: params.goodType,
            identifier: params.identifier
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
