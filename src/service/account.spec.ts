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

const project = { id: 'id' };

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
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
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
            accountType: ''
        })({
            project: projectRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('Pecorinoサービスがエラーを返せばCinerinoエラーに変換されるはず', async () => {
        const pecorinoRequestError = { name: 'PecorinoRequestError' };
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
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
            accountType: ''
        })({
            project: projectRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Cinerino);
        sandbox.verify();
    });
});
