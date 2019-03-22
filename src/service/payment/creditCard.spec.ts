// tslint:disable:no-implicit-dependencies
/**
 * クレジットカード決済サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;
let existingTransaction: any;

before(() => {
    sandbox = sinon.createSandbox();
    existingTransaction = {
        id: '123',
        agent: { typeOf: 'Person' },
        seller: { typeOf: domain.factory.organizationType.MovieTheater },
        object: {
            customerContact: {},
            authorizeActions: [
                {
                    id: 'actionId',
                    actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
                    purpose: {},
                    object: {
                        typeOf: domain.factory.paymentMethodType.CreditCard,
                        amount: 123,
                        orderId: 'orderId'
                    },
                    result: {
                        price: 123,
                        entryTranArgs: {},
                        execTranArgs: {}
                    }
                }
            ]
        },
        result: {
            order: { orderNumber: 'orderNumber' }
        },
        potentialActions: {
            order: {
                typeOf: domain.factory.actionType.OrderAction,
                potentialActions: {
                    payCreditCard: { typeOf: domain.factory.actionType.PayAction },
                    payPoint: { typeOf: domain.factory.actionType.PayAction },
                    useMvtk: { typeOf: domain.factory.actionType.UseAction }
                }
            }
        }
    };
});

describe('service.payment.creditCard.authorize()', () => {
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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .resolves(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .once()
            .resolves(execTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves({});
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.payment.creditCard.authorize({
            project: { id: 'projectId', gmoInfo: { siteId: '', sitePass: '' } },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.creditCard.authorize({
            project: {
                id: 'projectId',
                gmoInfo: {
                    siteId: 'siteId',
                    sitePass: 'sitePass'
                }
            },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        })
            .catch((err) => err);

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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.creditCard.authorize({
            project: {
                id: 'projectId',
                gmoInfo: {
                    siteId: 'siteId',
                    sitePass: 'sitePass'
                }
            },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        })
            .catch((err) => err);
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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.creditCard.authorize({
            project: {
                id: 'projectId',
                gmoInfo: {
                    siteId: 'siteId',
                    sitePass: 'sitePass'
                }
            },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        })
            .catch((err) => err);

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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.creditCard.authorize({
            project: {
                id: 'projectId',
                gmoInfo: {
                    siteId: 'siteId',
                    sitePass: 'sitePass'
                }
            },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        })
            .catch((err) => err);

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
            typeOf: domain.factory.transactionType.PlaceOrder,
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

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const organizationRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(organizationRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(domain.GMO.services.credit)
            .expects('entryTran')
            .once()
            .rejects(entryTranResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('execTran')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.payment.creditCard.authorize({
            project: {
                id: 'projectId',
                gmoInfo: {
                    siteId: 'siteId',
                    sitePass: 'sitePass'
                }
            },
            agent: agent,
            purpose: transaction,
            object: {
                typeOf: domain.factory.paymentMethodType.CreditCard,
                orderId: orderId,
                amount: amount,
                method: domain.GMO.utils.util.Method.Lump,
                creditCard: creditCard,
                additionalProperty: []
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            seller: organizationRepo
        })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});

describe('service.payment.creditCard.voidTransaction()', () => {
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
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .resolves();

        const result = await domain.service.payment.creditCard.voidTransaction({
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
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .never();

        const result = await domain.service.payment.creditCard.voidTransaction({
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
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .rejects();

        const result = await domain.service.payment.creditCard.voidTransaction({
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
});

describe('cancelCreditCardAuth()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryとGMOの状態が正常であれば、エラーにならないはず', async () => {
        const authorizeActions = [
            {
                id: 'actionId',
                actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
                object: { typeOf: domain.factory.paymentMethodType.CreditCard },
                purpose: {},
                result: {
                    entryTranArgs: {},
                    execTranArgs: {}
                }
            }
        ];
        const actionRepo = new domain.repository.Action(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('searchByPurpose')
            .once()
            .resolves(authorizeActions);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .exactly(authorizeActions.length)
            .resolves();
        sandbox.mock(actionRepo)
            .expects('cancel')
            .exactly(authorizeActions.length)
            .resolves({});

        const result = await domain.service.payment.creditCard.cancelCreditCardAuth(existingTransaction.id)({ action: actionRepo });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('payCreditCard()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('仮売上状態であれば、実売上に成功するはず', async () => {
        const searchTradeResult = { jobCd: domain.GMO.utils.util.JobCd.Auth };
        const action = { id: 'actionId' };
        const params = {
            typeOf: <domain.factory.actionType.PayAction>domain.factory.actionType.PayAction,
            agent: <any>{},
            object: [{
                typeOf: <'PaymentMethod'>'PaymentMethod',
                paymentMethod: {
                    typeOf: <domain.factory.paymentMethodType.CreditCard>domain.factory.paymentMethodType.CreditCard,
                    name: '',
                    paymentMethodId: '',
                    additionalProperty: []
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .resolves();
        sandbox.mock(invoiceRepo)
            .expects('changePaymentStatus')
            .once()
            .resolves();

        const result = await domain.service.payment.creditCard.payCreditCard(params)({
            action: actionRepo,
            invoice: invoiceRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('すでに実売上済であれば、実売上リクエストは実行されないはず', async () => {
        const searchTradeResult = { jobCd: domain.GMO.utils.util.JobCd.Sales };
        const action = { id: 'actionId' };
        const params = {
            typeOf: <domain.factory.actionType.PayAction>domain.factory.actionType.PayAction,
            agent: <any>{},
            object: [{
                typeOf: <'PaymentMethod'>'PaymentMethod',
                paymentMethod: {
                    typeOf: <domain.factory.paymentMethodType.CreditCard>domain.factory.paymentMethodType.CreditCard,
                    name: '',
                    paymentMethodId: '',
                    additionalProperty: []
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .never();
        sandbox.mock(invoiceRepo)
            .expects('changePaymentStatus')
            .once()
            .resolves();

        const result = await domain.service.payment.creditCard.payCreditCard(params)({
            action: actionRepo,
            invoice: invoiceRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('GMO実売上に失敗すればアクションにエラー結果が追加されるはず', async () => {
        const searchTradeResult = { jobCd: domain.GMO.utils.util.JobCd.Auth };
        const action = { id: 'actionId' };
        const alterTranResult = new Error('alterTranError');
        const params = {
            typeOf: <domain.factory.actionType.PayAction>domain.factory.actionType.PayAction,
            agent: <any>{},
            object: [{
                typeOf: <'PaymentMethod'>'PaymentMethod',
                paymentMethod: {
                    typeOf: <domain.factory.paymentMethodType.CreditCard>domain.factory.paymentMethodType.CreditCard,
                    name: '',
                    paymentMethodId: '',
                    additionalProperty: []
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .rejects(alterTranResult);
        sandbox.mock(invoiceRepo)
            .expects('changePaymentStatus')
            .never();

        const result = await domain.service.payment.creditCard.payCreditCard(params)({
            action: actionRepo,
            invoice: invoiceRepo
        })
            .catch((err) => err);

        assert.deepEqual(result, alterTranResult);
        sandbox.verify();
    });
});

describe('refundCreditCard()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('実売上状態であれば売上取消するはず', async () => {
        const refundActionAttributes = {
            typeOf: <domain.factory.actionType.RefundAction>domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: <any>{
                    typeOf: domain.factory.actionType.SendAction
                }
            },
            agent: <any>{},
            recipient: <any>{},
            purpose: <any>{},
            object: <any>{
                typeOf: domain.factory.actionType.PayAction,
                object: [
                    { entryTranArgs: {} }
                ]
            }
        };
        const action = refundActionAttributes;
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Sales };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .resolves();
        sandbox.mock(taskRepo)
            .expects('save')
            .once();

        const result = await domain.service.payment.creditCard.refundCreditCard(refundActionAttributes)({
            action: actionRepo,
            task: taskRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('売上取消状態であれば状態変更しないはず', async () => {
        const refundActionAttributes = {
            typeOf: <domain.factory.actionType.RefundAction>domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: <any>{
                    typeOf: domain.factory.actionType.SendAction
                }
            },
            agent: <any>{},
            recipient: <any>{},
            purpose: <any>{},
            object: <any>{
                typeOf: domain.factory.actionType.PayAction,
                object: [
                    { entryTranArgs: {} }
                ]
            }
        };
        const action = refundActionAttributes;
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Void };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .never();
        sandbox.mock(taskRepo)
            .expects('save')
            .once();

        const result = await domain.service.payment.creditCard.refundCreditCard(refundActionAttributes)({
            action: actionRepo,
            task: taskRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('クレジットカード取引状態変更に失敗すればアクションにエラー結果が追加されるはず', async () => {
        const refundActionAttributes = {
            typeOf: <domain.factory.actionType.RefundAction>domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: <any>{
                    typeOf: domain.factory.actionType.SendAction
                }
            },
            agent: <any>{},
            recipient: <any>{},
            purpose: <any>{},
            object: <any>{
                typeOf: domain.factory.actionType.PayAction,
                object: [
                    { entryTranArgs: {} }
                ]
            }
        };
        const action = refundActionAttributes;
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Sales };
        const alterTranResult = new Error('alterTranError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .withExactArgs(refundActionAttributes)
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(domain.GMO.services.credit)
            .expects('searchTrade')
            .once()
            .resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit)
            .expects('alterTran')
            .once()
            .rejects(alterTranResult);
        sandbox.mock(taskRepo)
            .expects('save')
            .never();

        const result = await domain.service.payment.creditCard.refundCreditCard(refundActionAttributes)({
            action: actionRepo,
            task: taskRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, alterTranResult);
        sandbox.verify();
    });
});
