// tslint:disable:no-implicit-dependencies
/**
 * ownershipInfo repository test
 */
import { } from 'mocha';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

import { MongoRepository as OwnershipInfoRepo } from './ownershipInfo';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('識別子で所有権を保管する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、保管できるはず', async () => {
        const ownershipInfo = { identifier: 'identifier' };

        const repository = new OwnershipInfoRepo(mongoose.connection);

        sandbox.mock(repository.ownershipInfoModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.ownershipInfoModel(ownershipInfo));

        const result = await repository.saveByIdentifier(<any>ownershipInfo);

        assert.equal(result.identifier, ownershipInfo.identifier);
        sandbox.verify();
    });
});
