// tslint:disable:no-implicit-dependencies
/**
 * オファーサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../index';

import * as OfferService from './offer';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('searchEvents4cinemasunshine()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const project = {
            typeOf: <domain.factory.organizationType.Project>domain.factory.organizationType.Project,
            id: 'id',
            settings: { useEventRepo: true }
        };
        const event = {
            coaInfo: {
                dateJouei: '20170831'
            },
            identifier: 'identifier'
        };
        const events = [event];
        const searchConditions = {
            superEventLocationIdentifiers: ['12345']
        };
        const eventRepo = new domain.repository.Event(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(eventRepo)
            .expects('search')
            .once()
            .resolves(events);
        sandbox.mock(eventRepo)
            .expects('count')
            .once()
            .resolves(events.length);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);

        const result = await OfferService.searchEvents4cinemasunshine({
            project: project,
            conditions: <any>searchConditions
        })({
            event: eventRepo,
            project: projectRepo
        });
        assert(Array.isArray(result.data));
        assert(typeof result.totalCount === 'number');
        assert.equal(result.data.length, events.length);
        sandbox.verify();
    });
});

describe('findEventById4cinemasunshine()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const project = {
            typeOf: <domain.factory.organizationType.Project>domain.factory.organizationType.Project,
            id: 'id',
            settings: { useEventRepo: true }
        };
        const event = {
            coaInfo: {
                dateJouei: '20170831'
            },
            id: 'id'
        };
        const eventRepo = new domain.repository.Event(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(eventRepo)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);

        const result = await OfferService.findEventById4cinemasunshine({
            id: event.id,
            project: { id: 'id' }
        })({
            event: eventRepo,
            project: projectRepo
        });

        assert.equal(result.id, event.id);
        sandbox.verify();
    });
});
