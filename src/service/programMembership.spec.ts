// tslint:disable:no-implicit-dependencies
/**
 * 会員プログラムサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('会員プログラム注文タスクを作成する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('リポジトリが正常であればタスクを作成できるはず', async () => {
        const programMembership = {
            offers: [{ price: 123 }]
        };
        const seller = { name: {} };
        const task = {};
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);
        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(programMembershipRepo)
            .expects('findById')
            .once()
            .resolves(programMembership);
        sandbox.mock(taskRepo)
            .expects('save')
            .once()
            .resolves(task);

        const result = await domain.service.programMembership.createRegisterTask(<any>{
            agent: {},
            seller: {}
        })({
            seller: sellerRepo,
            programMembership: programMembershipRepo,
            task: taskRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});
