// tslint:disable:no-implicit-dependencies
/**
 * placeOrder transaction service test
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
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

        const result = await domain.service.transaction.placeOrder.exportTasks({ status: status })({
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

        const result = await domain.service.transaction.placeOrder.exportTasks({ status: status })({
            task: taskRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('exportTasksById()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('確定取引であれば2つのタスクがエクスポートされるはず', async () => {
        const numberOfTasks = 2;
        const transaction = {
            project: { id: 'id' },
            id: 'transactionId',
            status: domain.factory.transactionStatusType.Confirmed,
            result: {},
            potentialActions: {}
        };
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findById')
            .once()
            .resolves(transaction);
        sandbox.mock(taskRepo)
            .expects('save')
            .exactly(numberOfTasks)
            .resolves();

        const result = await domain.service.transaction.placeOrder.exportTasksById(transaction)({
            task: taskRepo,
            transaction: transactionRepo
        });

        assert(Array.isArray(result));
        assert.equal(result.length, numberOfTasks);
        sandbox.verify();
    });

    it('非対応ステータスの取引であれば、NotImplementedエラーになるはず', async () => {
        const transaction = {
            project: { id: 'id' },
            id: 'transactionId',
            status: domain.factory.transactionStatusType.InProgress
        };
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findById')
            .once()
            .resolves(transaction);
        sandbox.mock(taskRepo)
            .expects('save')
            .never();

        const result = await domain.service.transaction.placeOrder.exportTasksById(transaction)({
            task: taskRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotImplemented);
        sandbox.verify();
    });
});

describe('sendEmail', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('DBが正常であれば、タスクが登録されるはず', async () => {
        const transaction = {
            project: { id: 'id' },
            id: 'id',
            status: domain.factory.transactionStatusType.Confirmed,
            seller: {},
            agent: {},
            result: { order: {} }
        };
        const emailMessageAttributes = {
            sender: { name: 'name', email: 'test@example.com' },
            toRecipient: { name: 'name', email: 'test@example.com' },
            about: 'about',
            text: 'text'
        };
        const task = {};

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findById')
            .once()
            .resolves(transaction);
        sandbox.mock(taskRepo)
            .expects('save')
            .once()
            .resolves(task);

        const result = await domain.service.transaction.placeOrder.sendEmail(
            transaction.id,
            <any>emailMessageAttributes
        )({
            task: taskRepo,
            transaction: transactionRepo
        });

        assert(typeof result === 'object');
        sandbox.verify();
    });

    it('取引ステータスが確定済でなければ、Forbiddenエラーになるはず', async () => {
        const transaction = {
            project: { id: 'id' },
            id: 'id',
            status: domain.factory.transactionStatusType.InProgress,
            seller: {},
            agent: {}
        };
        const emailMessageAttributes = {
            sender: { name: 'name', email: 'test@example.com' },
            toRecipient: { name: 'name', email: 'test@example.com' },
            about: 'about',
            text: 'text'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findById')
            .once()
            .resolves(transaction);
        sandbox.mock(taskRepo)
            .expects('save')
            .never();

        const result = await domain.service.transaction.placeOrder.sendEmail(
            transaction.id,
            <any>emailMessageAttributes
        )({
            task: taskRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });
});
