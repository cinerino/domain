// tslint:disable:no-implicit-dependencies
/**
 * 確認番号リポジトリテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;
before(() => {
    sandbox = sinon.createSandbox();
});

describe('確認番号を発行する', () => {
    beforeEach(() => {
        sandbox.restore();
    });
    it('Redisが正常であれば発行できるはず', async () => {
        const confirmationNumberRepo = new domain.repository.ConfirmationNumber(redis.createClient());
        const result = await confirmationNumberRepo.publish({ orderDate: new Date() });
        assert.equal(typeof result, 'number');
        sandbox.verify();
    });
});
