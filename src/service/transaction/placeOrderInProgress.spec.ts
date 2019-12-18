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

        const projectRepo = new domain.repository.Project(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves({ typeOf: 'Project', id: 'projectId' });
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
            project: { typeOf: 'Project', id: 'id' },
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                }
            },
            agent: agent,
            seller: seller
        })({
            project: projectRepo,
            transaction: transactionRepo,
            seller: sellerRepo
        });

        assert.deepEqual(result, transaction);
        // assert.equal(result.expires, transaction.expires);
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

        const projectRepo = new domain.repository.Project(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves({ typeOf: 'Project', id: 'projectId' });
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
            project: { typeOf: 'Project', id: 'id' },
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                }
            },
            agent: agent,
            seller: seller
        })({
            project: projectRepo,
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

        const projectRepo = new domain.repository.Project(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves({ typeOf: 'Project', id: 'projectId' });
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
            project: { typeOf: 'Project', id: 'id' },
            expires: transaction.expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                }
            },
            agent: agent,
            seller: seller
        })({
            project: projectRepo,
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

        const projectRepo = new domain.repository.Project(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves({ typeOf: 'Project', id: 'projectId' });
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
            project: { typeOf: 'Project', id: 'id' },
            expires: expires,
            object: {
                passport: {
                    issuer: '',
                    token: passportToken,
                    secret: ''
                }
            },
            agent: agent,
            seller: seller
        })({
            project: projectRepo,
            transaction: transactionRepo,
            seller: sellerRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, startResult);
        sandbox.verify();
    });
});
