// tslint:disable:no-implicit-dependencies
/**
 * 会員プログラムリポジトリーテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('会員プログラムを検索する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であれば配列を取得できるはず', async () => {
        const searchConditions = { id: 'id' };
        const programMembershipRepo = new domain.repository.ProgramMembership(domain.mongoose.connection);
        sandbox.mock(programMembershipRepo.programMembershipModel).expects('find').once()
            .chain('sort')
            .chain('exec')
            .resolves([new programMembershipRepo.programMembershipModel()]);

        const result = await programMembershipRepo.search(searchConditions);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});
