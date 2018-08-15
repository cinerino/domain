// tslint:disable:no-implicit-dependencies
/**
 * エラーハンドラーテスト
 */
import { BAD_REQUEST, FORBIDDEN, INTERNAL_SERVER_ERROR, NOT_FOUND, TOO_MANY_REQUESTS, UNAUTHORIZED } from 'http-status';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as errorHandler from './errorHandler';
import * as domain from './index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('Pecorinoリクエストエラーをハンドリングする', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    // tslint:disable-next-line:mocha-no-side-effect-code
    [
        BAD_REQUEST,
        UNAUTHORIZED,
        FORBIDDEN,
        NOT_FOUND,
        TOO_MANY_REQUESTS,
        INTERNAL_SERVER_ERROR
    ].map((code) => {
        it(`Pecorinoサービスが${code}であればCinerinoErrorに変換されるはず`, () => {
            const error = {
                name: 'PecorinoRequestError',
                code: code
            };

            const result = errorHandler.handlePecorinoError(error);
            assert(result instanceof domain.factory.errors.Cinerino);
            sandbox.verify();
        });
    });
});
