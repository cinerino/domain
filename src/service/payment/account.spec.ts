// tslint:disable:no-implicit-dependencies
/**
 * ポイント決済承認アクションテスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

const project = {
    typeOf: domain.factory.organizationType.Project,
    id: 'id'
};

before(() => {
    sandbox = sinon.createSandbox();
});

describe('service.payment.account.authorize()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('口座サービスを正常であればエラーにならないはず', async () => {
        const agent = {
            id: 'agentId',
            memberOf: {}
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            gmoInfo: {
                shopId: 'shopId',
                shopPass: 'shopPass'
            },
            paymentAccepted: [{
                paymentMethodType: domain.factory.paymentMethodType.Account,
                accountType: 'accountType'
            }]
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const amount = 1234;
        const action = {
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const pendingTransaction = { typeOf: domain.factory.pecorino.transactionType.Transfer, id: 'transactionId' };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .resolves(pendingTransaction);

        const result = await domain.service.payment.account.authorize({
            project: <any>project,
            purpose: transaction,
            agent: transaction.agent,
            object: {
                typeOf: domain.factory.paymentMethodType.Account,
                paymentMethod: domain.factory.paymentMethodType.Account,
                amount: amount,
                fromAccount: {
                    accountType: 'accountType',
                    accountNumber: 'fromAccountNumber'
                },
                toAccount: {
                    accountType: 'accountType',
                    accountNumber: 'toAccountNumber'
                },
                notes: 'notes'
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('口座サービスでエラーが発生すればアクションにエラー結果が追加されるはず', async () => {
        const agent = {
            id: 'agentId',
            memberOf: {}
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            gmoInfo: {
                shopId: 'shopId',
                shopPass: 'shopPass'
            },
            paymentAccepted: [
                {
                    paymentMethodType: domain.factory.paymentMethodType.Account,
                    accountType: 'accountType'
                }
            ]
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const amount = 1234;
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const startPayTransactionResult = new Error('startPayTransactionError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('start')
            .once()
            .rejects(startPayTransactionResult);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.account.authorize({
            project: <any>project,
            purpose: transaction,
            agent: transaction.agent,
            object: {
                typeOf: domain.factory.paymentMethodType.Account,
                paymentMethod: domain.factory.paymentMethodType.Account,
                amount: amount,
                currency: domain.factory.priceCurrency.JPY,
                fromAccount: {
                    accountType: 'accountType',
                    accountNumber: 'fromAccountNumber'
                },
                toAccount: {
                    accountType: 'accountType',
                    accountNumber: 'toAccountNumber'
                },
                notes: 'notes'
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);

        assert(result instanceof Error);
        sandbox.verify();
    });
});
