// tslint:disable:no-implicit-dependencies
/**
 * 印刷アクションリポジトリーテスト
 */
import { } from 'mocha';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import { MongoRepository as PrintActionRepo } from './print';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('PrintActionRepo.printTicket()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すれば、オブジェクトを取得できるはず', async () => {
        const agentId = 'agentId';
        const ticket = {};

        const printActionRepo = new PrintActionRepo(mongoose.connection);
        const doc = new printActionRepo.actionModel();

        sandbox.mock(printActionRepo.actionModel)
            .expects('create').once()
            .resolves(doc);

        const result = await printActionRepo.printTicket(agentId, <any>ticket);
        assert(typeof result, 'object');
        sandbox.verify();
    });
});

describe('PrintActionRepo.searchPrintTicket()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すれば、配列を取得できるはず', async () => {
        const conditions = {};

        const printActionRepo = new PrintActionRepo(mongoose.connection);
        const doc = new printActionRepo.actionModel();

        sandbox.mock(printActionRepo.actionModel)
            .expects('find').once()
            .chain('exec')
            .resolves([doc]);

        const result = await printActionRepo.searchPrintTicket(<any>conditions);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});
