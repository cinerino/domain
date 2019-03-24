// tslint:disable:no-implicit-dependencies
/**
 * ポイント決済承認アクションテスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

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
                accountType: domain.factory.accountType.Point
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
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const transferService = new domain.pecorinoapi.service.transaction.Transfer(<any>{});

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
        sandbox.mock(transferService)
            .expects('start')
            .once()
            .resolves(pendingTransaction);

        const result = await domain.service.payment.account.authorize({
            purpose: transaction,
            agent: transaction.agent,
            object: {
                typeOf: domain.factory.paymentMethodType.Account,
                amount: amount,
                fromAccount: {
                    accountType: domain.factory.accountType.Point,
                    accountNumber: 'fromAccountNumber'
                },
                toAccount: {
                    accountType: domain.factory.accountType.Point,
                    accountNumber: 'toAccountNumber'
                },
                notes: 'notes'
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            transferTransactionService: transferService
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

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
                    accountType: domain.factory.accountType.Point
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
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const transferService = new domain.pecorinoapi.service.transaction.Transfer(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(transferService)
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
            purpose: transaction,
            agent: transaction.agent,
            object: {
                typeOf: domain.factory.paymentMethodType.Account,
                amount: amount,
                currency: domain.factory.priceCurrency.JPY,
                fromAccount: {
                    accountType: domain.factory.accountType.Point,
                    accountNumber: 'fromAccountNumber'
                },
                toAccount: {
                    accountType: domain.factory.accountType.Point,
                    accountNumber: 'toAccountNumber'
                },
                notes: 'notes'
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            transferTransactionService: transferService
        })
            .catch((err) => err);

        assert(result instanceof Error);
        sandbox.verify();
    });
});

describe('ポイント決済承認を取り消す', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('出金取引による承認アクションが存在すれば、キャンセルできるはず', async () => {
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: { id: 'agentId' },
            seller: {}
        };
        const action = {
            result: {
                pendingTransaction: { typeOf: domain.factory.pecorino.transactionType.Withdraw }
            }
        };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const withdrawService = new domain.pecorinoapi.service.transaction.Withdraw(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('cancel')
            .once()
            .resolves(action);
        sandbox.mock(withdrawService)
            .expects('cancel')
            .once()
            .resolves();

        const result = await domain.service.payment.account.voidTransaction({
            id: 'actionId',
            agent: transaction.agent,
            purpose: transaction
        })({
            action: actionRepo,
            transaction: transactionRepo,
            withdrawTransactionService: withdrawService
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('転送取引による承認アクションが存在すれば、キャンセルできるはず', async () => {
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: { id: 'agentId' },
            seller: {}
        };
        const action = {
            result: {
                pendingTransaction: { typeOf: domain.factory.pecorino.transactionType.Transfer }
            }
        };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const transferService = new domain.pecorinoapi.service.transaction.Transfer(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('cancel')
            .once()
            .resolves(action);
        sandbox.mock(transferService)
            .expects('cancel')
            .once()
            .resolves();

        const result = await domain.service.payment.account.voidTransaction({
            id: 'actionId',
            agent: transaction.agent,
            purpose: transaction
        })({
            action: actionRepo,
            transaction: transactionRepo,
            transferTransactionService: transferService
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});