/**
 * エラーハンドラー
 * 外部サービスと連携している場合に、サービス(API)のエラーを本ドメインのエラーに変換する責任を担います。
 */
import * as chevre from '@chevre/domain';
import { BAD_REQUEST, CONFLICT, FORBIDDEN, NOT_FOUND, TOO_MANY_REQUESTS, UNAUTHORIZED } from 'http-status';
import { factory } from './factory';

export enum MongoErrorCode {
    DuplicateKey = 11000
}

export import handleCOAReserveTemporarilyError = chevre.errorHandler.handleCOAReserveTemporarilyError;
export import handleAWSError = chevre.errorHandler.handleAWSError;

/**
 * Chevreサービスエラーをハンドリングする
 * 可能であればCinerinoエラーへ変換します
 */
export function handleChevreError(error: any) {
    let handledError: Error = error;

    if (error.name === 'ChevreRequestError') {
        // Chevre APIのステータスコード4xxをハンドリング
        // ChevreAPIのレスポンスステータスコードが4xxであればクライアントエラー
        const message = `${error.name}:${error.message}`;
        switch (error.code) {
            case BAD_REQUEST: // 400
                handledError = new factory.errors.Argument(
                    (typeof error.argumentName === 'string' && error.argumentName.length > 0) ? error.argumentName : 'ChevreArgument',
                    message
                );
                break;
            case UNAUTHORIZED: // 401
                handledError = new factory.errors.Unauthorized(message);
                break;
            case FORBIDDEN: // 403
                handledError = new factory.errors.Forbidden(message);
                break;
            case NOT_FOUND: // 404
                handledError = new factory.errors.NotFound(message);
                break;
            case CONFLICT: // 409
                handledError = new factory.errors.AlreadyInUse(
                    (typeof error.entityName === 'string' && error.entityName.length > 0) ? error.entityName : 'ChevreArgument',
                    (Array.isArray(error.fieldNames)) ? error.fieldNames : [],
                    message
                );
                break;
            case TOO_MANY_REQUESTS: // 429
                handledError = new factory.errors.RateLimitExceeded(message);
                break;
            default:
                handledError = new factory.errors.ServiceUnavailable(message);
        }
    }

    return handledError;
}
