// tslint:disable:no-implicit-dependencies
/**
 * クレジットカード決済承認サービステスト
 */
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../../../../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('action.authorize.creditCard.create()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('GMOが正常であれば、エラーにならないはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const entryTranResult = {};
        const execTranResult = {};
        const action = {
            id: 'actionId',
            agent: agent,
            recipient: seller
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().resolves(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').once().resolves(execTranResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    // it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
    //     const agent = {
    //         id: 'agentId'
    //     };
    //     const seller = {
    //         id: 'sellerId',
    //         name: { ja: 'ja', en: 'ne' },
    //         gmoInfo: {
    //             shopId: 'shopId',
    //             shopPass: 'shopPass'
    //         }
    //     };
    //     const transaction = {
    //         id: 'transactionId',
    //         agent: {
    //             id: 'anotherAgentId'
    //         },
    //         seller: seller
    //     };
    //     const orderId = 'orderId';
    //     const amount = 1234;
    //     const creditCard = <any>{};

    //     const actionRepo = new domain.repository.Action(domain.mongoose.connection);
    //     const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
    //     const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

    //     sandbox.mock(transactionRepo).expects('findInProgressById').once()
    //         .withExactArgs(transaction.id).resolves(transaction);
    //     sandbox.mock(actionRepo).expects('start').never();
    //     sandbox.mock(organizationRepo).expects('findById').never();
    //     sandbox.mock(domain.GMO.services.credit).expects('entryTran').never();
    //     sandbox.mock(domain.GMO.services.credit).expects('execTran').never();

    //     const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create(
    //         agent.id,
    //         transaction.id,
    //         orderId,
    //         amount,
    //         domain.GMO.utils.util.Method.Lump,
    //         creditCard
    //     )({
    //         action: actionRepo,
    //         transaction: transactionRepo,
    //         organization: organizationRepo
    //     })
    //         .catch((err) => err);

    //     assert(result instanceof domain.factory.errors.Forbidden);
    //     sandbox.verify();
    // });

    it('GMOでエラーが発生すれば、承認アクションを諦めて、エラーとなるはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const entryTranResult = new Error('entryTranResultError');

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        }).catch((err) => err);

        assert(result instanceof Error);
        sandbox.verify();
    });

    it('GMO処理でエラーオブジェクトでない例外が発生すれば、承認アクションを諦めて、そのままエラーとなるはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const entryTranResult = new Error('entryTranResult');

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        }).catch((err) => err);
        assert.deepEqual(result, entryTranResult);
        sandbox.verify();
    });

    it('GMOで流量制限オーバーエラーが発生すれば、承認アクションを諦めて、ServiceUnavailableエラーとなるはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const entryTranResult = new Error('message');
        entryTranResult.name = 'GMOServiceBadRequestError';
        (<any>entryTranResult).errors = [{
            info: 'E92000001'
        }];

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.RateLimitExceeded);
        sandbox.verify();
    });

    it('GMOでオーダーID重複エラーが発生すれば、承認アクションを諦めて、AlreadyInUseエラーとなるはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const entryTranResult = new Error('message');
        entryTranResult.name = 'GMOServiceBadRequestError';
        (<any>entryTranResult).errors = [{
            info: 'E01040010'
        }];

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.AlreadyInUse);
        sandbox.verify();
    });

    it('GMOServiceBadRequestErrorエラーが発生すれば、承認アクションを諦めて、Argumentエラーとなるはず', async () => {
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
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const orderId = 'orderId';
        const amount = 1234;
        const creditCard = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            agent: agent,
            recipient: seller
        };
        const entryTranResult = new Error('message');
        entryTranResult.name = 'GMOServiceBadRequestError';
        (<any>entryTranResult).errors = [{
            info: 'info'
        }];

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(organizationRepo).expects('findById').once().resolves(seller);
        sandbox.mock(domain.GMO.services.credit).expects('entryTran').once().rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit).expects('execTran').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
            agentId: agent.id,
            transactionId: transaction.id,
            typeOf: domain.factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard,
            orderId: orderId,
            amount: amount,
            method: domain.GMO.utils.util.Method.Lump,
            creditCard: creditCard
        })({
            action: actionRepo,
            transaction: transactionRepo,
            organization: organizationRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});

describe('action.authorize.creditCard.cancel()', () => {
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
            id: 'transactionId',
            agent: agent,
            seller: seller
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('cancel').once().resolves(action);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().resolves();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.cancel({
            agentId: agent.id,
            transactionId: transaction.id,
            actionId: action.id
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
            id: 'transactionId',
            agent: {
                id: 'anotherAgentId'
            },
            seller: seller
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('cancel').never();
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.cancel({
            agentId: agent.id,
            transactionId: transaction.id,
            actionId: actionId
        })({
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

    it('GMOで取消に失敗しても、エラーにならないはず', async () => {
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
            id: 'transactionId',
            agent: agent,
            seller: seller
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('cancel').once().resolves(action);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().rejects();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.cancel({
            agentId: agent.id,
            transactionId: transaction.id,
            actionId: action.id
        })({
            action: actionRepo,
            transaction: transactionRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
