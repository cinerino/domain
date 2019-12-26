// tslint:disable:no-implicit-dependencies
/**
 * telemetry repository test
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

describe('constructor()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('インスタンスを生成できるはず', async () => {
        const repository = new domain.repository.Telemetry(mongoose.connection);

        assert.notEqual(typeof repository.telemetryModel, undefined);
        sandbox.verify();
    });
});
