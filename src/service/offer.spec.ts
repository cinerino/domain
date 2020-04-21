// tslint:disable:no-implicit-dependencies
/**
 * オファーサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../index';

import * as OfferService from './offer';

const project = {
    typeOf: <domain.factory.organizationType.Project>domain.factory.organizationType.Project,
    id: 'id',
    settings: {
        chevre: { endpoint: '' }
    }
};

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('searchEvents()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const event = {
            id: 'id'
        };
        const events = [event];
        const searchConditions = {
            superEventLocationIdentifiers: ['12345']
        };

        const projectRepo = new domain.repository.Project(mongoose.connection);

        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('search')
            .once()
            .resolves({
                totalCount: events.length,
                data: events
            });
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);

        const result = await OfferService.searchEvents({
            project: project,
            conditions: <any>searchConditions
        })({
            project: projectRepo
        });
        assert(Array.isArray(result.data));
        assert(typeof result.totalCount === 'number');
        assert.equal(result.data.length, events.length);
        sandbox.verify();
    });
});
