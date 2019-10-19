// tslint:disable:no-implicit-dependencies
/**
 * event repository test
 */
import { } from 'mocha';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import { } from 'sinon-mongoose';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('save()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、保管できるはず', async () => {
        const event = { identifier: 'identifier' };

        const repository = new domain.repository.Event(mongoose.connection);

        sandbox.mock(repository.eventModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves();

        const result = await repository.save(<any>event);

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('search()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、配列が返却されるはず', async () => {
        const conditions = {
            limit: 10,
            sort: {
                startFrom: domain.factory.sortType.Ascending
            },
            theater: 'theater',
            day: '20171114',
            superEvent: {
                ids: [''],
                locationBranchCodes: [''],
                workPerformedIdentifiers: ['']
            },
            superEventLocationIdentifiers: ['superEventLocationIdentifier'],
            eventStatuses: ['eventStatus'],
            workPerformedIdentifiers: ['workPerformedIdentifier'],
            startFrom: new Date(),
            startThrough: new Date(),
            endFrom: new Date(),
            endThrough: new Date()
        };

        const repository = new domain.repository.Event(mongoose.connection);
        const docs = [new repository.eventModel()];

        sandbox.mock(repository.eventModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves(docs);

        const result = await repository.search(<any>conditions);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});

describe('cancel()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const event = {
            typeOf: domain.factory.chevre.eventType.ScreeningEvent,
            id: 'id'
        };

        const repository = new domain.repository.Event(mongoose.connection);
        const doc = new repository.eventModel();

        sandbox.mock(repository.eventModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(doc);

        const result = await repository.cancel(event);

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
