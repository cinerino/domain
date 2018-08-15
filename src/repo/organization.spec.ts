// tslint:disable:no-implicit-dependencies
/**
 * organization repository test
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

describe('findById()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('`組織が存在すれば、取得できるはず', async () => {
        const theaterId = 'theaterId';

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('findOne').once()
            .chain('exec').resolves(new repository.organizationModel());

        const result = await repository.findById(domain.factory.organizationType.MovieTheater, theaterId);

        assert.notEqual(result, undefined);
        sandbox.verify();
    });

    it('存在しなければ、NotFoundエラーとなるはず', async () => {
        const theaterId = 'theaterId';

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('findOne').once()
            .chain('exec').resolves(null);

        const result = await repository.findById(domain.factory.organizationType.MovieTheater, theaterId).catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('openMovieTheaterShop()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、保管できるはず', async () => {
        const movieTheater = { id: 'id' };

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('findOneAndUpdate').once()
            .chain('exec').resolves(new repository.organizationModel());

        const result = await repository.openMovieTheaterShop(<any>movieTheater);

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

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('find').once()
            .chain('exec').resolves([new repository.organizationModel()]);

        const result = await repository.searchMovieTheaters(conditions);

        assert(Array.isArray(result));
        sandbox.verify();
    });
});

describe('findMovieTheaterByBranchCode()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、配列が返却されるはず', async () => {
        const branchCode = 'branchCode';

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('findOne').once()
            .chain('exec').resolves(new repository.organizationModel());

        const result = await repository.findMovieTheaterByBranchCode({ branchCode: branchCode });

        assert.notEqual(result, undefined);
        sandbox.verify();
    });

    it('存在しなければ、NotFoundエラーとなるはず', async () => {
        const branchCode = 'branchCode';

        const repository = new domain.repository.Organization(domain.mongoose.connection);

        sandbox.mock(repository.organizationModel).expects('findOne').once()
            .chain('exec').resolves(null);

        const result = await repository.findMovieTheaterByBranchCode({ branchCode: branchCode }).catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});
