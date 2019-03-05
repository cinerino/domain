// tslint:disable:no-implicit-dependencies
/**
 * place repository test
 */
import { } from 'mocha';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('saveMovieTheater()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、保管できるはず', async () => {
        const movieTheater = {};

        const repository = new domain.repository.Place(mongoose.connection);

        sandbox.mock(repository.placeModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.placeModel());

        const result = await repository.saveMovieTheater(<any>movieTheater);

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('searchMovieTheaters()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、配列が返却されるはず', async () => {
        const conditions = {};
        const numberOfResults = 99;

        const repository = new domain.repository.Place(mongoose.connection);
        const docs = Array.from(Array(numberOfResults))
            .map(() => new repository.placeModel());

        sandbox.mock(repository.placeModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves(docs);

        const result = await repository.searchMovieTheaters(<any>conditions);

        assert(Array.isArray(result));
        assert.equal(result.length, numberOfResults);
        sandbox.verify();
    });
});

describe('findMovieTheaterByBranchCode()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、オブジェクトが返却されるはず', async () => {
        const branchCode = 'branchCode';

        const repository = new domain.repository.Place(mongoose.connection);

        sandbox.mock(repository.placeModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(new repository.placeModel());

        const result = await repository.findMovieTheaterByBranchCode(branchCode);

        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('存在しなければ、NotFoundエラーとなるはず', async () => {
        const branchCode = 'branchCode';

        const repository = new domain.repository.Place(mongoose.connection);

        sandbox.mock(repository.placeModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.findMovieTheaterByBranchCode(branchCode)
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});
