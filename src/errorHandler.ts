/**
 * エラーハンドラー
 * 外部サービスと連携している場合に、サービス(API)のエラーを本ドメインのエラーに変換する責任を担います。
 */
import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, TOO_MANY_REQUESTS, UNAUTHORIZED } from 'http-status';
import { errors } from './factory';

/**
 * Chevreサービスエラーをハンドリングする
 */
export function handleChevreError(error: any) {
    let handledError: Error = error;

    if (error.name === 'ChevreRequestError') {
        // Chevre APIのステータスコード4xxをハンドリング
        // ChevreAPIのレスポンスステータスコードが4xxであればクライアントエラー
        const message = `${error.name}:${error.message}`;
        switch (error.code) {
            case BAD_REQUEST: // 400
                handledError = new errors.Argument('ChevreArgument', message);
                break;
            case UNAUTHORIZED: // 401
                handledError = new errors.Unauthorized(message);
                break;
            case FORBIDDEN: // 403
                handledError = new errors.Forbidden(message);
                break;
            case NOT_FOUND: // 404
                handledError = new errors.NotFound(message);
                break;
            case TOO_MANY_REQUESTS: // 429
                handledError = new errors.RateLimitExceeded(message);
                break;
            default:
                handledError = new errors.ServiceUnavailable(message);
        }
    }

    return handledError;
}

/**
 * Pecorinoサービスエラーをハンドリングする
 */
export function handlePecorinoError(error: any) {
    let handledError: Error = error;

    if (error.name === 'PecorinoRequestError') {
        // Pecorino APIのステータスコード4xxをハンドリング
        // PecorinoAPIのレスポンスステータスコードが4xxであればクライアントエラー
        const message = `${error.name}:${error.message}`;
        switch (error.code) {
            case BAD_REQUEST: // 400
                handledError = new errors.Argument('PecorinoArgument', message);
                break;
            case UNAUTHORIZED: // 401
                handledError = new errors.Unauthorized(message);
                break;
            case FORBIDDEN: // 403
                handledError = new errors.Forbidden(message);
                break;
            case NOT_FOUND: // 404
                handledError = new errors.NotFound(message);
                break;
            case TOO_MANY_REQUESTS: // 429
                handledError = new errors.RateLimitExceeded(message);
                break;
            default:
                handledError = new errors.ServiceUnavailable(message);
        }
    }

    return handledError;
}
