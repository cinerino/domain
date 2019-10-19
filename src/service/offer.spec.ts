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

        sandbox.mock(eventRepo)
            .expects('search')
            .once()
            .resolves(events);

        const result = await OfferService.searchEvents4cinemasunshine(<any>searchConditions)({
            event: eventRepo
        });
        assert(Array.isArray(result));
        assert.equal(result.length, events.length);
        sandbox.verify();
    });
});

describe('findEventById4cinemasunshine()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const event = {
            coaInfo: {
                dateJouei: '20170831'
            },
            identifier: 'identifier'
        };
        const eventRepo = new domain.repository.Event(mongoose.connection);

        sandbox.mock(eventRepo)
            .expects('findById')
            .once()
            .resolves(event);

        const result = await OfferService.findEventById4cinemasunshine(
            event.identifier
        )({
            event: eventRepo
        });

        assert.equal(result.identifier, event.identifier);
        sandbox.verify();
    });
});
