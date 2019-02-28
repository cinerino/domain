// tslint:disable:no-implicit-dependencies
/**
 * 進行中の注文取引サービステスト
 */
import * as waiter from '@waiter/domain';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
// import * as pug from 'pug';
import * as sinon from 'sinon';
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('start()', () => {
    beforeEach(() => {
        delete process.env.WAITER_PASSPORT_ISSUER;
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('販売者が存在すれば、開始できるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const transaction = {
            expires: new Date()
        };
        const passportToken = 'passportToken';
        const passport = {
            scope: `placeOrderTransaction.${seller.identifier}`,
            iat: 123,
            exp: 123,
            iss: process.env.WAITER_PASSPORT_ISSUER,
            issueUnit: {}
        };

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(transactionRepo)
            .expects('start')
            .once()
            .resolves(transaction);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .resolves(passport);

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>{}
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        });

        assert.deepEqual(result, transaction);
        // assert.equal(result.expires, transaction.expires);
        sandbox.verify();
    });

    it('クライアントユーザーにusernameが存在すれば、会員として開始できるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const transaction = {
            expires: new Date()
        };
        const clientUser = {
            username: 'username'
        };
        const passportToken = 'passportToken';
        const passport = {
            scope: `placeOrderTransaction.${seller.identifier}`,
            iat: 123,
            exp: 123,
            iss: process.env.WAITER_PASSPORT_ISSUER,
            issueUnit: {}
        };

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(transactionRepo)
            .expects('start')
            .once()
            .resolves(transaction);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .resolves(passport);

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>clientUser
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        });

        assert.deepEqual(result, transaction);
        sandbox.verify();
    });

    it('許可証トークンの検証に成功すれば、開始できるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const transaction = {
            expires: new Date()
        };
        const passportToken = 'passportToken';
        const passport = {
            scope: `placeOrderTransaction.${seller.identifier}`,
            iat: 123,
            exp: 123,
            iss: process.env.WAITER_PASSPORT_ISSUER,
            issueUnit: {}
        };

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .resolves(passport);
        sandbox.mock(transactionRepo)
            .expects('start')
            .once()
            .resolves(transaction);

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>{}
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        });
        assert.deepEqual(result, transaction);
        sandbox.verify();
    });

    it('許可証トークンの検証に失敗すれば、Argumentエラーとなるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const transaction = {
            expires: new Date()
        };
        const passportToken = 'passportToken';
        const verifyResult = new Error('verifyError');

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .rejects(verifyResult);
        sandbox.mock(transactionRepo)
            .expects('start')
            .never();

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>{}
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    it('取引作成時に何かしらエラーが発生すれば、そのままのエラーになるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const expires = new Date();
        const startResult = new Error('startError');
        const passportToken = 'passportToken';
        const passport = {
            scope: `placeOrderTransaction.${seller.identifier}`,
            iat: 123,
            exp: 123,
            iss: process.env.WAITER_PASSPORT_ISSUER,
            issueUnit: {}
        };

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .resolves(passport);
        sandbox.mock(transactionRepo)
            .expects('start')
            .once()
            .rejects(startResult);

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>{}
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, startResult);
        sandbox.verify();
    });

    it('許可証を重複使用しようとすれば、AlreadyInUseエラーとなるはず', async () => {
        process.env.WAITER_PASSPORT_ISSUER = 'https://example.com';
        const agent = {
            typeOf: domain.factory.personType.Person,
            id: 'agentId'
        };
        const seller = {
            typeOf: domain.factory.organizationType.MovieTheater,
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' },
            identifier: 'sellerIdentifier'
        };
        const expires = new Date();
        const startResult = mongoose.mongo.MongoError.create({ code: 11000 });
        const passportToken = 'passportToken';
        const passport = {
            scope: `placeOrderTransaction.${seller.identifier}`,
            iat: 123,
            exp: 123,
            iss: process.env.WAITER_PASSPORT_ISSUER,
            issueUnit: {}
        };

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(waiter.service.passport)
            .expects('verify')
            .once()
            .resolves(passport);
        sandbox.mock(transactionRepo)
            .expects('start')
            .once()
            .rejects(startResult);

        const result = await domain.service.transaction.placeOrderInProgress.start({
            expires: expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                },
                clientUser: <any>{}
            },
            agent: agent,
            seller: seller
        })({
            transaction: transactionRepo,
            seller: sellerRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.AlreadyInUse);
        sandbox.verify();
    });
});

describe('setCustomerContact()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('取引が進行中であれば、エラーにならないはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: '+819012345678',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('setCustomerContactOnPlaceOrderInProgress')
            .once()
            .resolves();

        const result = await domain.service.transaction.placeOrderInProgress.setCustomerContact({
            agent: agent,
            id: transaction.id,
            object: {
                customerContact: <any>contact
            }
        })({ transaction: transactionRepo });

        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: { id: 'anotherAgentId' },
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: '+819012345678',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('setCustomerContactOnPlaceOrderInProgress')
            .never();

        const result = await domain.service.transaction.placeOrderInProgress.setCustomerContact({
            agent: agent,
            id: transaction.id,
            object: {
                customerContact: <any>contact
            }
        })({ transaction: transactionRepo })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

    it('電話番号フォーマットが不適切であれば、Argumentエラーが投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller,
            object: {
            }
        };
        const contact = {
            givenName: 'givenName',
            familyName: 'familyName',
            telephone: 'xxxxxxxx',
            email: 'john@example.com'
        };

        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .never()
            .resolves(transaction);
        sandbox.mock(transactionRepo)
            .expects('setCustomerContactOnPlaceOrderInProgress')
            .never();

        const result = await domain.service.transaction.placeOrderInProgress.setCustomerContact({
            agent: agent,
            id: transaction.id,
            object: {
                customerContact: <any>contact
            }
        })({ transaction: transactionRepo })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});
