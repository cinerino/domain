// tslint:disable:no-implicit-dependencies
/**
 * クレジットカード決済サービステスト
 */
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
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('findAuthorizeByTransactionId').once()
            .withExactArgs(existingTransaction.id).resolves(authorizeActions);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').exactly(authorizeActions.length).resolves();
        sandbox.mock(actionRepo).expects('cancel').exactly(authorizeActions.length).resolves({});

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
                    paymentMethodId: ''
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);
        sandbox.mock(actionRepo).expects('giveUp').never();
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().resolves();
        sandbox.mock(invoiceRepo).expects('changePaymentStatus').once().resolves();

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
                    paymentMethodId: ''
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);
        sandbox.mock(actionRepo).expects('giveUp').never();
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').never();
        sandbox.mock(invoiceRepo).expects('changePaymentStatus').once().resolves();

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
                    paymentMethodId: ''
                },
                entryTranArgs: <any>{},
                execTranArgs: <any>{},
                price: 100,
                priceCurrency: domain.factory.priceCurrency.JPY
            }],
            purpose: existingTransaction
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const invoiceRepo = new domain.repository.Invoice(domain.mongoose.connection);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('giveUp').resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().rejects(alterTranResult);
        sandbox.mock(invoiceRepo).expects('changePaymentStatus').never();

        const result = await domain.service.payment.creditCard.payCreditCard(params)({
            action: actionRepo,
            invoice: invoiceRepo
        }).catch((err) => err);

        assert.deepEqual(result, alterTranResult);
        sandbox.verify();
    });
});

describe('refundCreditCard()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('実売上状態であれば売上取消するはず', async () => {
        const placeOrderTransaction = { ...existingTransaction };
        const refundActionAttributes = {
            typeOf: domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: {
                    typeOf: domain.factory.actionType.SendAction
                }
            }
        };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: placeOrderTransaction.result.order },
            potentialActions: {
                returnOrder: {
                    potentialActions: {
                        refundCreditCard: refundActionAttributes
                    }
                }
            }
        };
        const action = { typeOf: refundActionAttributes.typeOf, id: 'actionId' };
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Sales };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().resolves([placeOrderTransaction]);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);
        sandbox.mock(actionRepo).expects('giveUp').never();
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().resolves();
        sandbox.mock(taskRepo).expects('save').once();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('返品取引の潜在アクションが未定義であればNotFoundエラーとなるはず', async () => {
        const placeOrderTransaction = { ...existingTransaction };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: placeOrderTransaction.result.order }
            // potentialActions: {
            //     returnOrder: {
            //         potentialActions: {
            //             refund: refundActionAttributes
            //         }
            //     }
            // }
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().never();
        sandbox.mock(actionRepo).expects('start').never();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('注文取引結果が未定義であればNotFoundエラーとなるはず', async () => {
        const placeOrderTransaction = { ...existingTransaction, result: undefined };
        const refundActionAttributes = {
            typeOf: domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: {
                    typeOf: domain.factory.actionType.SendAction
                }
            }
        };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: existingTransaction.result.order },
            potentialActions: {
                returnOrder: {
                    potentialActions: {
                        refund: refundActionAttributes
                    }
                }
            }
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().resolves([placeOrderTransaction]);
        sandbox.mock(actionRepo).expects('start').never();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('注文返品アクションの潜在アクションが未定義であればNotFoundエラーとなるはず', async () => {
        const placeOrderTransaction = { ...existingTransaction };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: placeOrderTransaction.result.order },
            potentialActions: {
                returnOrder: {}
            }
        };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().resolves([placeOrderTransaction]);
        sandbox.mock(actionRepo).expects('start').never();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('売上取消状態であれば状態変更しないはず', async () => {
        const placeOrderTransaction = { ...existingTransaction };
        const refundActionAttributes = {
            typeOf: domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: {
                    typeOf: domain.factory.actionType.SendAction
                }
            }
        };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: placeOrderTransaction.result.order },
            potentialActions: {
                returnOrder: {
                    potentialActions: {
                        refundCreditCard: refundActionAttributes
                    }
                }
            }
        };
        const action = { typeOf: refundActionAttributes.typeOf, id: 'actionId' };
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Void };

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().resolves([placeOrderTransaction]);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);
        sandbox.mock(actionRepo).expects('giveUp').never();
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').never();
        sandbox.mock(taskRepo).expects('save').once();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('クレジットカード取引状態変更に失敗すればアクションにエラー結果が追加されるはず', async () => {
        const placeOrderTransaction = { ...existingTransaction };
        const refundActionAttributes = {
            typeOf: domain.factory.actionType.RefundAction,
            potentialActions: {
                sendEmailMessage: {
                    typeOf: domain.factory.actionType.SendAction
                }
            }
        };
        const returnOrderTransaction = {
            id: 'returnOrderTransactionId',
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: { order: placeOrderTransaction.result.order },
            potentialActions: {
                returnOrder: {
                    potentialActions: {
                        refundCreditCard: refundActionAttributes
                    }
                }
            }
        };
        const action = { typeOf: refundActionAttributes.typeOf, id: 'actionId' };
        const searchTradeResult = { status: domain.GMO.utils.util.Status.Sales };
        const alterTranResult = new Error('alterTranError');

        const actionRepo = new domain.repository.Action(domain.mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
        const taskRepo = new domain.repository.Task(domain.mongoose.connection);

        sandbox.mock(transactionRepo).expects('findById').once().resolves(returnOrderTransaction);
        sandbox.mock(transactionRepo).expects('search').once().resolves([placeOrderTransaction]);
        sandbox.mock(actionRepo).expects('start').once()
            .withExactArgs(refundActionAttributes).resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(domain.GMO.services.credit).expects('searchTrade').once().resolves(searchTradeResult);
        sandbox.mock(domain.GMO.services.credit).expects('alterTran').once().rejects(alterTranResult);
        sandbox.mock(taskRepo).expects('save').never();

        const result = await domain.service.payment.creditCard.refundCreditCard({ transactionId: returnOrderTransaction.id })({
            action: actionRepo,
            transaction: transactionRepo,
            task: taskRepo
        }).catch((err) => err);
        assert.deepEqual(result, alterTranResult);
        sandbox.verify();
    });
});
