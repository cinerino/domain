// tslint:disable:no-implicit-dependencies
/**
 * 進行中のサービス登録アクションリポジトリテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('サービス登録アクションをロックする', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisが正常であればロックできるはず', async () => {
        const actionRepo = new domain.repository.action.RegisterServiceInProgress(redis.createClient());

        const result = await actionRepo.lock(
            {
                agent: { id: 'id' },
                product: { id: 'productId' }
            },
            'actionId'
        );
        assert(typeof result, 'number');
        sandbox.verify();
    });
});

describe('サービス登録アクションロックを解除する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisが正常であればロックできるはず', async () => {
        const actionRepo = new domain.repository.action.RegisterServiceInProgress(redis.createClient());

        const result = await actionRepo.unlock(
            {
                agent: { id: 'id' },
                product: { id: 'productId' }
            }
        );
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
