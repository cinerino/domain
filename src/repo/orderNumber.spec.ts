// tslint:disable:no-implicit-dependencies
/**
 * 注文番号リポジトリーテスト
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

describe('注文番号を発行する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Redisが正常であれば発行できるはず', async () => {
        const orderNumberRepo = new domain.repository.OrderNumber(redis.createClient());

        const result = await orderNumberRepo.publish({
            orderDate: new Date(),
            sellerType: domain.factory.organizationType.MovieTheater,
            sellerBranchCode: 'sellerBranchCode'
        });
        assert.equal(typeof result, 'string');
        sandbox.verify();
    });
});
