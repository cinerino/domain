// tslint:disable:no-implicit-dependencies
/**
 * 口座サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
// import * as redis from 'redis-mock';
import * as sinon from 'sinon';
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;
// let redisClient: redis.RedisClient;

const project = { id: 'id', settings: { chevre: { endpoint: '' }, pecorino: { endpoint: '' } } };

before(() => {
    sandbox = sinon.createSandbox();
    // redisClient = redis.createClient();
});

describe('ポイント口座を開設する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('口座リポジトリが正常であれば開設できるはず', async () => {
        const account = {};
        // const accountNumberRepo = new domain.repository.AccountNumber(redisClient);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        // sandbox.mock(accountNumberRepo)
        //     .expects('publish')
        //     .once()
        //     .resolves('accountNumber');
        sandbox.mock(domain.chevre.service.ServiceOutputIdentifier.prototype)
            .expects('publish')
            .once()
            .resolves({ identifier: 'identifier' });
        sandbox.mock(domain.pecorinoapi.service.Account.prototype)
            .expects('open')
            .once()
            .resolves(account);

        const result = await domain.service.account.openWithoutOwnershipInfo({
            project: <any>project,
            name: '',
            accountType: <any>''
        })({
            // accountNumber: accountNumberRepo,
            project: projectRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せばCinerinoエラーに変換されるはず', async () => {
        const pecorinoRequestError = { name: 'PecorinoRequestError' };
        // const accountNumberRepo = new domain.repository.AccountNumber(redisClient);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        // sandbox.mock(accountNumberRepo)
        //     .expects('publish')
        //     .once()
        //     .resolves('accountNumber');
        sandbox.mock(domain.chevre.service.ServiceOutputIdentifier.prototype)
            .expects('publish')
            .once()
            .resolves({ identifier: 'identifier' });
        sandbox.mock(domain.pecorinoapi.service.Account.prototype)
            .expects('open')
            .once()
            .rejects(pecorinoRequestError);

        const result = await domain.service.account.openWithoutOwnershipInfo({
            project: <any>project,
            name: '',
            accountType: <any>''
        })({
            // accountNumber: accountNumberRepo,
            project: projectRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Cinerino);
        sandbox.verify();
    });
});

describe('ポイントを入金する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であれば入金できるはず', async () => {
        const depositTransaction = {};

        const projectRepo = new domain.repository.Project(mongoose.connection);

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
            .resolves(depositTransaction);
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('confirm')
            .once()
            .resolves();

        const result = await domain.service.account.deposit({
            project: <any>project,
            agent: <any>{},
            object: {
                amount: 0,
                description: '',
                toLocation: <any>{ accountNumber: '12345' }
            },
            recipient: <any>{}
        })({
            project: projectRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せばCinerinoエラーに変換されるはず', async () => {
        const pecorinoRequestError = { name: 'PecorinoRequestError' };

        const projectRepo = new domain.repository.Project(mongoose.connection);

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
            .rejects(pecorinoRequestError);
        sandbox.mock(domain.chevre.service.transaction.MoneyTransfer.prototype)
            .expects('confirm')
            .never();

        const result = await domain.service.account.deposit({
            project: <any>project,
            agent: <any>{},
            object: {
                amount: 0,
                description: '',
                toLocation: <any>{ accountNumber: '12345' }
            },
            recipient: <any>{}
        })({
            project: projectRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Cinerino);
        sandbox.verify();
    });
});
