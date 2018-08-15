// tslint:disable:no-implicit-dependencies
/**
 * Pecorino決済サービステスト
 */
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;
let pecorinoAuthClient: domain.pecorinoapi.auth.ClientCredentials;

before(() => {
    sandbox = sinon.createSandbox();
    pecorinoAuthClient = new domain.pecorinoapi.auth.ClientCredentials(<any>{});
});

describe('Pecorino支払を実行する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であれば、転送取引を実行できるはず', async () => {
        const action = { id: 'actionId' };
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Transfer.prototype).expects('confirm').once().resolves();

        const result = await domain.service.payment.pecorino.payPoint(<any>{
            object: {
                pecorinoEndpoint: 'pecorinoEndpoint',
                pecorinoTransaction: { typeOf: domain.pecorinoapi.factory.transactionType.Transfer }
            }
        })({
            action: actionRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスが正常であれば、出金取引を実行できるはず', async () => {
        const action = { id: 'actionId' };
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Withdraw.prototype).expects('confirm').once().resolves();

        const result = await domain.service.payment.pecorino.payPoint(<any>{
            object: {
                pecorinoEndpoint: 'pecorinoEndpoint',
                pecorinoTransaction: { typeOf: domain.pecorinoapi.factory.transactionType.Withdraw }
            }
        })({
            action: actionRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せば、アクションを断念するはず', async () => {
        const action = { id: 'actionId' };
        const pecorinoError = new Error('pecorinoError');
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.pecorinoapi.service.transaction.Transfer.prototype).expects('confirm').once().rejects(pecorinoError);
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves({});

        const result = await domain.service.payment.pecorino.payPoint(<any>{
            object: {
                pecorinoEndpoint: 'pecorinoEndpoint',
                pecorinoTransaction: { typeOf: domain.pecorinoapi.factory.transactionType.Transfer }
            }
        })({
            action: actionRepo,
            pecorinoAuthClient: pecorinoAuthClient
        }).catch((err) => err);
        assert.deepEqual(result, pecorinoError);
        sandbox.verify();
    });
});

describe('Pecorino支払を中止する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であれば、転送取引を中止できるはず', async () => {
        const actions = [{
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: { typeOf: domain.factory.action.authorize.paymentMethod.point.ObjectType.PointPayment },
            result: {
                pecorinoEndpoint: 'pecorinoEndpoint',
                pecorinoTransaction: { typeOf: domain.pecorinoapi.factory.transactionType.Transfer }
            }
        }];
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('findAuthorizeByTransactionId').once().resolves(actions);
        sandbox.mock(domain.pecorinoapi.service.transaction.Transfer.prototype).expects('cancel').exactly(actions.length).resolves();

        const result = await domain.service.payment.pecorino.cancelPointAuth('transactionId')({
            action: actionRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスが正常であれば、出金取引を中止できるはず', async () => {
        const actions = [{
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: { typeOf: domain.factory.action.authorize.paymentMethod.point.ObjectType.PointPayment },
            result: {
                pecorinoEndpoint: 'pecorinoEndpoint',
                pecorinoTransaction: { typeOf: domain.pecorinoapi.factory.transactionType.Withdraw }
            }
        }];
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('findAuthorizeByTransactionId').once().resolves(actions);
        sandbox.mock(domain.pecorinoapi.service.transaction.Withdraw.prototype).expects('cancel').exactly(actions.length).resolves();

        const result = await domain.service.payment.pecorino.cancelPointAuth('transactionId')({
            action: actionRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('Pecorino支払を返金する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('支払が転送取引の場合、転送取引が実行されるはず', async () => {
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Transfer.prototype).expects('start').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Transfer.prototype).expects('confirm').once().resolves();
        sandbox.mock(actionRepo).expects('complete').once().resolves({});
        sandbox.mock(taskRepo).expects('save').once().resolves({});

        const result = await domain.service.payment.pecorino.refundPoint(<any>{
            object: {
                object: {
                    pecorinoEndpoint: 'pecorinoEndpoint',
                    pecorinoTransaction: {
                        typeOf: domain.pecorinoapi.factory.transactionType.Transfer,
                        agent: {},
                        recipient: {},
                        object: {}
                    }
                }
            },
            potentialActions: { sendEmailMessage: {} }
        })({
            action: actionRepo,
            task: taskRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('支払が出金取引の場合、入金取引が実行されるはず', async () => {
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype).expects('start').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype).expects('confirm').once().resolves();
        sandbox.mock(actionRepo).expects('complete').once().resolves({});
        sandbox.mock(taskRepo).expects('save').once().resolves({});

        const result = await domain.service.payment.pecorino.refundPoint(<any>{
            object: {
                object: {
                    pecorinoEndpoint: 'pecorinoEndpoint',
                    pecorinoTransaction: {
                        typeOf: domain.pecorinoapi.factory.transactionType.Withdraw,
                        agent: {},
                        recipient: {},
                        object: {}
                    }
                }
            },
            potentialActions: { sendEmailMessage: {} }
        })({
            action: actionRepo,
            task: taskRepo,
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せば、アクションを断念するはず', async () => {
        const pecorinoError = new Error('pecorinoError');
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype).expects('start').once().rejects(pecorinoError);
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves({});

        const result = await domain.service.payment.pecorino.refundPoint(<any>{
            object: {
                object: {
                    pecorinoEndpoint: 'pecorinoEndpoint',
                    pecorinoTransaction: {
                        typeOf: domain.pecorinoapi.factory.transactionType.Withdraw,
                        agent: {},
                        recipient: {},
                        object: {}
                    }
                }
            },
            potentialActions: { sendEmailMessage: {} }
        })({
            action: actionRepo,
            task: taskRepo,
            pecorinoAuthClient: pecorinoAuthClient
        }).catch((err) => err);
        assert.deepEqual(result, pecorinoError);
        sandbox.verify();
    });
});
