// tslint:disable:no-implicit-dependencies
/**
 * creativeWork repository test
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('saveMovie()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const movie = { identifier: 'identifier' };

        const creativeWorkRepo = new domain.repository.CreativeWork(domain.mongoose.connection);

        sandbox.mock(creativeWorkRepo.creativeWorkModel)
            .expects('findOneAndUpdate').once()
            .chain('exec')
            .resolves();

        const result = await creativeWorkRepo.saveMovie(<any>movie);

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
