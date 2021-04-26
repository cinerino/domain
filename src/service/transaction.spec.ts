// tslint:disable:no-implicit-dependencies
/**
 * transaction service test
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

describe('updateAgent()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('取引が進行中であれば、エラーにならないはず', async () => {
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: '+819012345678',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('updateAgent')
            .once()
            .resolves();

        const result = await domain.service.transaction.updateAgent({
            agent: { ...agent, ...contact },
            typeOf: transaction.typeOf,
            id: transaction.id
        })({ transaction: transactionRepo });

        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: { id: 'anotherAgentId' },
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: '+819012345678',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('updateAgent')
            .never();

        const result = await domain.service.transaction.updateAgent({
            agent: { ...agent, ...contact },
            typeOf: transaction.typeOf,
            id: transaction.id
        })({ transaction: transactionRepo })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

    it('電話番号フォーマットが不適切であれば、Argumentエラーが投げられるはず', async () => {
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: 'xxxxxxxx',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .never()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('updateAgent')
            .never();

        const result = await domain.service.transaction.updateAgent({
            agent: { ...agent, ...contact },
            typeOf: transaction.typeOf,
            id: transaction.id
        })({ transaction: transactionRepo })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});

describe('exportTasks()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('タスクエクスポート待ちの取引があれば、エクスポートされるはず', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        const status = domain.factory.transactionStatusType.Confirmed;
        const task = {};
        const transaction = {
            project: { id: 'id' },
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            status: status,
            result: {},
            potentialActions: {}
        };

        sandbox.mock(transactionRepo)
            .expects('startExportTasks')
            .once()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('findById')
            .once()
            .resolves(transaction);
        sandbox.mock(taskRepo)
            .expects('save')
            .atLeast(1)
            .resolves(task);
        sandbox.mock(transactionRepo)
            .expects('setTasksExportedById')
            .once()
            .resolves();

        const result = await domain.service.transaction.exportTasks({
            status: status
        })({
            task: taskRepo,
            transaction: transactionRepo
        });
        assert(Array.isArray(result));
        sandbox.verify();
    });

    it('タスクエクスポート待ちの取引がなければ、何もしないはず', async () => {
        const status = domain.factory.transactionStatusType.Confirmed;

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('startExportTasks')
            .once()
            .resolves(null);
        sandbox.mock(domain.service.transaction.placeOrder)
            .expects('exportTasksById')
            .never();
        sandbox.mock(transactionRepo)
            .expects('setTasksExportedById')
            .never();

        const result = await domain.service.transaction.exportTasks({
            status: status
        })({
            task: taskRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
