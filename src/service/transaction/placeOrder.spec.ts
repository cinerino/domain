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

describe('exportTasksById()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('確定取引であればタスクがエクスポートされるはず', async () => {
        const numberOfTasks = 1;
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
