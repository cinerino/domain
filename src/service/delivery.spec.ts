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

    it('Chevreサービスが正常であればアクションを完了できるはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionNumberRepo = new domain.chevre.service.TransactionNumber(<any>{});

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(transactionNumberRepo)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.accountTransaction.Deposit.prototype)
            .expects('start')
            .once()
            .resolves({ id: 'id' });
        sandbox.mock(domain.chevre.service.accountTransaction.Deposit.prototype)
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
            transactionNumber: transactionNumberRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Chevreサービスがエラーを返せばアクションを断念するはず', async () => {
        const chevreError = new Error('chevreError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionNumberRepo = new domain.chevre.service.TransactionNumber(<any>{});

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(transactionNumberRepo)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.accountTransaction.Deposit.prototype)
            .expects('start')
            .once()
            .rejects(chevreError);
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
            transactionNumber: transactionNumberRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, chevreError);
        sandbox.verify();
    });
});

describe('ポイントインセンティブを返却する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Chevreサービスが正常であればアクションを完了できるはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionNumberRepo = new domain.chevre.service.TransactionNumber(<any>{});

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(transactionNumberRepo)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.accountTransaction.Withdraw.prototype)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(domain.chevre.service.accountTransaction.Withdraw.prototype)
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
            transactionNumber: transactionNumberRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Chevreサービスがエラーを返せばアクションを断念するはず', async () => {
        const chevreError = new Error('chevreError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionNumberRepo = new domain.chevre.service.TransactionNumber(<any>{});

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(transactionNumberRepo)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(domain.chevre.service.accountTransaction.Withdraw.prototype)
            .expects('start')
            .once()
            .rejects(chevreError);
        sandbox.mock(domain.chevre.service.accountTransaction.Withdraw.prototype)
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
            transactionNumber: transactionNumberRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, chevreError);
        sandbox.verify();
    });
});
