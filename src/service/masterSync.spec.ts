// tslint:disable:no-implicit-dependencies
/**
 * masterSync service test
 */
import * as COA from '@motionpicture/coa-service';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

import * as MasterSyncService from './masterSync';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('importScreeningEvents()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
        const movieTheater = {
            branchCode: '123',
            containsPlace: [
                { branchCode: '01' },
                { branchCode: '02' }
            ]
        };
        const filmFromCOA = [
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                dateBegin: '20190206',
                dateEnd: '20190206',
                showTime: 100
            }
        ];
        const schedulesFromCOA = [
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                screenCode: '01',
                timeBegin: '0900',
                timeEnd: '0900'
            },
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                screenCode: '02',
                timeBegin: '0900',
                timeEnd: '0900'
            }
        ];
        const screeningEventsInMongo: any[] = [
            { identifier: 'cancelingId' }
        ];
        const eventRepo = new domain.repository.Event(mongoose.connection);

        sandbox.mock(COA.service.Master.prototype)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.service.Master.prototype)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.service.Master.prototype)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.service.Master.prototype)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.service.Master.prototype)
            .expects('kubunName')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(6)
            .resolves([{}]);
        sandbox.mock(eventRepo)
            .expects('save')
            .exactly(filmFromCOA.length + schedulesFromCOA.length);
        sandbox.mock(eventRepo)
            .expects('search')
            .once()
            .resolves(screeningEventsInMongo);
        sandbox.mock(eventRepo)
            .expects('cancel')
            .once();

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: domain.factory.organizationType.Project, id: 'id' },
            locationBranchCode: movieTheater.branchCode,
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('劇場に存在しないスクリーンのスケジュールがあれば、エラー出力だけしてスルーするはず', async () => {
        const movieTheater = {
            branchCode: '123',
            containsPlace: [
                { branchCode: '01' },
                { branchCode: '02' }
            ]
        };
        const filmFromCOA = [
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum'
            }
        ];
        const schedulesFromCOA = [
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                screenCode: 'screenCode'
            }
        ];
        // const screeningEvent = {
        //     identifier: 'identifier'
        // };
        const eventRepo = new domain.repository.Event(mongoose.connection);

        sandbox.mock(COA.service.Master.prototype)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.service.Master.prototype)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.service.Master.prototype)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.service.Master.prototype)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.service.Master.prototype)
            .expects('kubunName')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(6)
            .resolves([{}]);
        sandbox.mock(eventRepo)
            .expects('save')
            .exactly(filmFromCOA.length);
        sandbox.mock(eventRepo)
            .expects('search')
            .once()
            .resolves([]);

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: domain.factory.organizationType.Project, id: 'id' },
            locationBranchCode: '123',
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});
