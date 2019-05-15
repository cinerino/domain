// tslint:disable:no-implicit-dependencies
/**
 * task service test
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../index';

import * as PlaceOrderTask from './task/placeOrder';

let sandbox: sinon.SinonSandbox;
const project = { typeOf: <'Project'>'Project', id: 'projectId' };

before(() => {
    sandbox = sinon.createSandbox();
});

describe('executeByName()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('未実行タスクが存在すれば、実行されるはず', async () => {
        const task = {
            project: project,
            id: 'id',
            name: domain.factory.taskName.PlaceOrder,
            data: { datakey: 'dataValue' },
            status: domain.factory.taskStatus.Running
        };
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(taskRepo)
            .expects('executeOneByName')
            .once()
            .resolves(task);
        sandbox.mock(PlaceOrderTask)
            .expects('call')
            .once()
            .withArgs(task.data)
            .returns(async () => Promise.resolve());
        sandbox.mock(taskRepo)
            .expects('pushExecutionResultById')
            .once()
            .withArgs(task.id, domain.factory.taskStatus.Executed)
            .resolves();

        const result = await domain.service.task.executeByName(task)({
            taskRepo: taskRepo,
            connection: mongoose.connection
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('未実行タスクが存在しなければ、実行されないはず', async () => {
        const taskName = domain.factory.taskName.PlaceOrder;
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(taskRepo)
            .expects('executeOneByName')
            .once()
            .resolves(null);
        sandbox.mock(domain.service.task)
            .expects('execute')
            .never();

        const result = await domain.service.task.executeByName({ project: project, name: taskName })({
            taskRepo: taskRepo,
            connection: mongoose.connection
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('retry()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const INTERVAL = 10;
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(taskRepo)
            .expects('retry')
            .once()
            .resolves();

        const result = await domain.service.task.retry({ project: project, intervalInMinutes: INTERVAL })({ task: taskRepo });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('abort()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const INTERVAL = 10;
        const task = {
            id: 'id',
            executionResults: [{ error: 'error' }]
        };
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(taskRepo)
            .expects('abortOne')
            .once()
            .resolves(task);
        sandbox.mock(domain.service.notification)
            .expects('report2developers')
            .once()
            .withArgs(domain.service.task.ABORT_REPORT_SUBJECT)
            .returns(async () => Promise.resolve());

        const result = await domain.service.task.abort({ project: project, intervalInMinutes: INTERVAL })({ task: taskRepo });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('execute()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('存在するタスク名であれば、完了ステータスへ変更されるはず', async () => {
        const task = {
            id: 'id',
            name: domain.factory.taskName.PlaceOrder,
            data: { datakey: 'dataValue' },
            status: domain.factory.taskStatus.Running
        };
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(PlaceOrderTask)
            .expects('call')
            .once()
            .withArgs(task.data)
            .returns(async () => Promise.resolve());
        sandbox.mock(taskRepo)
            .expects('pushExecutionResultById')
            .once()
            .withArgs(task.id, domain.factory.taskStatus.Executed)
            .resolves();

        const result = await domain.service.task.execute(<any>task)({
            taskRepo: taskRepo,
            connection: mongoose.connection
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('存在しないタスク名であれば、ステータスは変更されないはず', async () => {
        const task = {
            id: 'id',
            name: 'invalidTaskName',
            data: { datakey: 'dataValue' },
            status: domain.factory.taskStatus.Running
        };
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(taskRepo)
            .expects('pushExecutionResultById')
            .once()
            .withArgs(task.id, task.status)
            .resolves();

        const result = await domain.service.task.execute(<any>task)({
            taskRepo: taskRepo,
            connection: mongoose.connection
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
