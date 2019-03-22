// tslint:disable:no-implicit-dependencies
/**
 * 汎用決済承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('action.authorize.any.create()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('所有者の取引できれば、エラーにならないはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            paymentAccepted: [{
                paymentMethodType: domain.factory.paymentMethodType.Cash
            }]
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const amount = 1234;
        const additionalProperty = [{
            name: 'any name',
            value: 'some value'
        }];
        const action = {
            id: 'actionId',
            agent: agent,
            recipient: seller
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.payment.any.authorize({
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.Cash,
                amount: amount,
                additionalProperty: additionalProperty
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: sellerRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });
});

describe('action.authorize.any.cancel()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すれば、キャンセルできるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            paymentAccepted: [{
                paymentMethodType: domain.factory.paymentMethodType.CreditCard,
                gmoInfo: {
                    shopId: 'shopId',
                    shopPass: 'shopPass'
                }
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            result: {
                execTranArgs: {},
                entryTranArgs: {}
            }
        };
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: agent,
            seller: seller
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('cancel')
            .once()
            .resolves(action);

        const result = await domain.service.payment.any.voidTransaction({
            agent: agent,
            purpose: transaction,
            id: action.id
        })({
            action: actionRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            paymentAccepted: [{
                paymentMethodType: domain.factory.paymentMethodType.CreditCard,
                gmoInfo: {
                    shopId: 'shopId',
                    shopPass: 'shopPass'
                }
            }]
        };
        const actionId = 'actionId';
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            agent: {
                id: 'anotherAgentId'
            },
            seller: seller
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('cancel')
            .never();

        const result = await domain.service.payment.any.voidTransaction({
            agent: agent,
            purpose: transaction,
            id: actionId
        })({
            action: actionRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });
});
