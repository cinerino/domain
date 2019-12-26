// tslint:disable:no-implicit-dependencies
/**
 * 進行中の会員プログラム登録アクションリポジトリテスト
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

describe('会員プログラム登録アクションをロックする', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisが正常であればロックできるはず', async () => {
        const actionRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redis.createClient());

        const result = await actionRepo.lock(
            {
                id: 'id',
                programMembershipId: 'programMembershipId'
            },
            'actionId'
        );
        assert(typeof result, 'number');
        sandbox.verify();
    });
});

describe('会員プログラム登録アクションロックを解除する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisが正常であればロックできるはず', async () => {
        const actionRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redis.createClient());

        const result = await actionRepo.unlock(
            {
                id: 'id',
                programMembershipId: 'programMembershipId'
            }
        );
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
