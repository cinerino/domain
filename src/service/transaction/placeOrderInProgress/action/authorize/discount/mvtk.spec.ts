// tslint:disable:no-implicit-dependencies
/**
 * ムビチケ承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../../../../../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('action.authorize.mvtk.cancel()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すれば、キャンセルできるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };

        const authorizeActionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(authorizeActionRepo)
            .expects('cancel')
            .once()
            .resolves();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.discount.mvtk.cancel({
            agentId: agent.id,
            transactionId: transaction.id,
            actionId: action.id
        })({
            action: authorizeActionRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const action = {
            id: 'actionId'
        };
        const transaction = {
            id: 'transactionId',
            agent: { id: 'anotherAgentId' },
            seller: seller
        };

        const authorizeActionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(authorizeActionRepo)
            .expects('cancel')
            .never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.discount.mvtk.cancel({
            agentId: agent.id,
            transactionId: transaction.id,
            actionId: action.id
        })({
            action: authorizeActionRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });
});
