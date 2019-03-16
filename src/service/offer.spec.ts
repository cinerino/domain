// tslint:disable:no-implicit-dependencies
/**
 * 販売情報サービステスト
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

describe('searchScreeningEvents4cinemasunshine()', () => {
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
        const itemAvailabilityRepo = new domain.repository.itemAvailability.ScreeningEvent(<any>{});

        sandbox.mock(eventRepo)
            .expects('searchScreeningEvents')
            .once()
            .resolves(events);
        sandbox.mock(itemAvailabilityRepo)
            .expects('findOne')
            .exactly(events.length)
            // tslint:disable-next-line:no-magic-numbers
            .resolves(100);

        const result = await OfferService.searchScreeningEvents4cinemasunshine(<any>searchConditions)({
            event: eventRepo,
            itemAvailability: itemAvailabilityRepo
        });
        assert(Array.isArray(result));
        assert.equal(result.length, events.length);
        sandbox.verify();
    });
});

describe('findScreeningEventById4cinemasunshine()', () => {
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
        const itemAvailabilityRepo = new domain.repository.itemAvailability.ScreeningEvent(<any>{});

        sandbox.mock(eventRepo)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(itemAvailabilityRepo)
            .expects('findOne')
            .once()
            // tslint:disable-next-line:no-magic-numbers
            .resolves(100);

        const result = await OfferService.findScreeningEventById4cinemasunshine(
            event.identifier
        )({
            event: eventRepo,
            itemAvailability: itemAvailabilityRepo
        });

        assert.equal(result.identifier, event.identifier);
        sandbox.verify();
    });
});

describe('updateScreeningEventItemAvailability()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('COAから取得したイベントの数だけ在庫が更新されるはず', async () => {
        const theaterCode = 'theaterCode';
        const startFrom = new Date();
        const startThrough = new Date();
        const countFreeSeatResult = {
            theaterCode: theaterCode,
            listDate: [
                {
                    listPerformance: [
                        { cntReserveFree: 90, cntReserveMax: 100 },
                        { cntReserveFree: 90, cntReserveMax: 100 }
                    ]
                },
                {
                    listPerformance: [
                        { cntReserveFree: 90, cntReserveMax: 100 },
                        { cntReserveFree: 90, cntReserveMax: 100 }
                    ]
                }
            ]
        };

        const itemAvailabilityRepo = new domain.repository.itemAvailability.ScreeningEvent(<any>{});
        const numberOfEvents = countFreeSeatResult.listDate.reduce(
            (a, b) => a + b.listPerformance.length,
            0
        );

        sandbox.mock(domain.COA.services.reserve)
            .expects('countFreeSeat')
            .once()
            .withArgs(sinon.match({ theaterCode: theaterCode }))
            .resolves(countFreeSeatResult);
        sandbox.mock(itemAvailabilityRepo)
            .expects('updateOne')
            .exactly(numberOfEvents)
            .resolves();

        const result = await domain.service.offer.updateScreeningEventItemAvailability(
            theaterCode,
            startFrom,
            startThrough
        )({ itemAvailability: itemAvailabilityRepo });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
