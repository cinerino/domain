// tslint:disable:no-implicit-dependencies
/**
 * 配送サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

const project = { id: 'id' };

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('ポイントインセンティブを適用する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であればアクションを完了できるはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .resolves({ id: 'id' });
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('confirm')
            .once()
            .resolves();
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await domain.service.delivery.givePointAward(<any>{
            project: { id: project.id },
            agent: { name: {} },
            recipient: {},
            object: {
                toLocation: {}
            },
            purpose: {}
        })({
            action: actionRepo,
            project: projectRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せばアクションを断念するはず', async () => {
        const pecorinoError = new Error('pecorinoError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .rejects(pecorinoError);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});

        const result = await domain.service.delivery.givePointAward(<any>{
            project: { id: project.id },
            agent: { name: {} },
            recipient: {},
            object: {
                toLocation: {}
            },
            purpose: {}
        })({
            action: actionRepo,
            project: projectRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, pecorinoError);
        sandbox.verify();
    });
});

describe('ポイントインセンティブを返却する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であればアクションを完了できるはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('confirm')
            .once()
            .resolves();
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await domain.service.delivery.returnPointAward(<any>{
            project: { id: project.id },
            agent: {},
            recipient: {},
            object: {
                object: {
                    pointTransaction: { object: { fromLocation: {}, toLocation: {} } },
                    toLocation: {}
                },
                purpose: {
                    project: {},
                    customer: {},
                    seller: { name: {} }
                }
            }
        })({
            action: actionRepo,
            project: projectRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せばアクションを断念するはず', async () => {
        const pecorinoError = new Error('pecorinoError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .rejects(pecorinoError);
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('confirm')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});

        const result = await domain.service.delivery.returnPointAward(<any>{
            project: { id: project.id },
            agent: {},
            recipient: {},
            object: {
                object: {
                    pointTransaction: { object: { fromLocation: {}, toLocation: {} } },
                    toLocation: {}
                },
                purpose: {
                    project: {},
                    customer: {},
                    seller: { name: {} }
                }
            }
        })({
            action: actionRepo,
            project: projectRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, pecorinoError);
        sandbox.verify();
    });
});
