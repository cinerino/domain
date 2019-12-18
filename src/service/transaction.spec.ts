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

describe('exportTasks()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('タスクエクスポート待ちの取引があれば、エクスポートされるはず', async () => {
        const projectRepo = new domain.repository.Project(mongoose.connection);
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

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves({ id: '' });
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
            status: status,
            typeOf: domain.factory.transactionType.PlaceOrder
        })({
            project: projectRepo,
            task: taskRepo,
            transaction: transactionRepo
        });
        assert(Array.isArray(result));
        sandbox.verify();
    });

    it('タスクエクスポート待ちの取引がなければ、何もしないはず', async () => {
        const status = domain.factory.transactionStatusType.Confirmed;

        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .never();
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
            status: status,
            typeOf: domain.factory.transactionType.PlaceOrder
        })({
            project: projectRepo,
            task: taskRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
