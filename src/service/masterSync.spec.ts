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

// describe('importMovies()', () => {
//     afterEach(() => {
//         sandbox.restore();
//     });

//     it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
//         const filmsFromCOA = [
//             {
//                 titleCode: 'titleCode',
//                 titleBranchNum: 'titleBranchNum'
//             },
//             {
//                 titleCode: 'titleCode',
//                 titleBranchNum: 'titleBranchNum'
//             }
//         ];
//         // const movie = {};
//         const creativeWorkRepo = new CreativeWorkRepo(mongoose.connection);

//         sandbox.mock(COA.services.master).expects('title').once().resolves(filmsFromCOA);
//         sandbox.mock(creativeWorkRepo).expects('saveMovie').exactly(filmsFromCOA.length).resolves();

//         const result = await MasterSyncService.importMovies('123')({ creativeWork: creativeWorkRepo });
//         assert.equal(result, undefined);
//         sandbox.verify();
//     });
// });

describe('matchWitchXML', () => {
    afterEach(() => {
        sandbox.restore();
    });

    const coaSchedule = {
        dateJouei: 'date',
        titleCode: 'title code',
        screenCode: 'screen code',
        timeBegin: 'time begin',
        timeEnd: 'time end'
    };

    const xmlSchedule = [[{
        date: 'other date',
        movie: [{
            movieShortCode: 'other title code',
            screen: [{
                screenCode: 'other screen code',
                time: [{
                    startTime: 'start time',
                    endTime: 'end time'
                }]
            }]
        }]
    }, {
        date: 'date',
        movie: [{
            movieShortCode: 'other title code',
            screen: [{
                screenCode: 'other screen code',
                time: [{
                    startTime: 'start time',
                    endTime: 'end time'
                }]
            }]
        }]
    }, {
        date: 'date',
        movie: [{
            movieShortCode: 'title code',
            screen: [{
                screenCode: 'other screen code',
                time: [{
                    startTime: 'start time',
                    endTime: 'end time'
                }]
            }]
        }]
    }, {
        date: 'date',
        movie: [{
            movieShortCode: 'title code',
            screen: [{
                screenCode: 'screen code',
                time: [{
                    startTime: 'start time',
                    endTime: 'end time'
                }]
            }]
        }]
    }, {
        date: 'date',
        movie: [{
            movieShortCode: 'title code',
            screen: [{
                screenCode: 'screen code',
                time: [{
                    startTime: 'time begin',
                    endTime: 'time end'
                }]
            }]
        }]
    }]];

    it('coaとXMLのデータが一緒の場合、結果はtrueはず', () => {
        const result = MasterSyncService.matchWithXML(<any>xmlSchedule, <any>coaSchedule);
        assert.equal(result, true);
    });

    it('coaとXMLのデータが違う場合、結果はfalseはず', () => {
        const result = MasterSyncService.matchWithXML(<any>[[xmlSchedule[0][0]]], <any>coaSchedule);
        assert.equal(result, false);
    });
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
        const seller = {
            additionalProperty: [
                // { name: 'xmlEndPoint', value: '{"baseUrl":"http://cinema.coasystems.net","theaterCodeName":"aira"}' }
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
        const sellerRepo = new domain.repository.Seller(mongoose.connection);

        sandbox.mock(COA.services.master)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.services.master)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.services.master)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.services.master)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.services.master)
            .expects('kubunName')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(6)
            .resolves([{}]);
        sandbox.mock(eventRepo)
            .expects('save')
            .exactly(filmFromCOA.length + schedulesFromCOA.length);
        sandbox.mock(sellerRepo)
            .expects('search')
            .once()
            .resolves([seller]);
        sandbox.mock(eventRepo)
            .expects('searchScreeningEvents')
            .once()
            .resolves(screeningEventsInMongo);
        sandbox.mock(eventRepo)
            .expects('cancel')
            .once();

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: 'Project', id: 'id' },
            locationBranchCode: movieTheater.branchCode,
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo,
            seller: sellerRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('XMLとCOAのデータが一緒の場合、正常で完了するはず', async () => {
        const movieTheater = {
            branchCode: '123',
            containsPlace: [
                { branchCode: '01' },
                { branchCode: '02' }
            ]
        };
        const seller = {
            additionalProperty: [
                { name: 'xmlEndPoint', value: '{"baseUrl":"http://cinema.coasystems.net","theaterCodeName":"aira"}' }
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
                dateJouei: '20190206',
                timeBegin: '0900',
                timeEnd: '0900'
            },
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                screenCode: '02',
                dateJouei: '20190206',
                timeBegin: '0900',
                timeEnd: '1000'
            }
        ];
        const xmlSchedule = [[{
            date: '20190206',
            movie: [{
                movieShortCode: 'titleCode',
                screen: [{
                    screenCode: '02',
                    time: [{
                        startTime: '0900',
                        endTime: '1000'
                    }]
                }]
            }]
        }]];

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);

        sandbox.mock(COA.services.master)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.services.master)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.services.master)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.services.master)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.services.master)
            .expects('xmlSchedule')
            .once()
            .resolves(xmlSchedule);
        sandbox.mock(COA.services.master)
            .expects('kubunName')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(6)
            .resolves([{}]);
        sandbox.mock(eventRepo)
            .expects('save')
            .exactly(filmFromCOA.length + 1);
        sandbox.mock(sellerRepo)
            .expects('search')
            .once()
            .resolves([seller]);
        sandbox.mock(eventRepo)
            .expects('searchScreeningEvents')
            .once()
            .resolves([]);
        sandbox.mock(eventRepo)
            .expects('cancel')
            .never();

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: 'Project', id: 'id' },
            locationBranchCode: movieTheater.branchCode,
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo,
            seller: sellerRepo
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
        const seller = {
            additionalProperty: [
                // { name: 'xmlEndPoint', value: '{"baseUrl":"http://cinema.coasystems.net","theaterCodeName":"aira"}' }
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
        const sellerRepo = new domain.repository.Seller(mongoose.connection);

        sandbox.mock(COA.services.master)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.services.master)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.services.master)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.services.master)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.services.master)
            .expects('kubunName')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(6)
            .resolves([{}]);
        sandbox.mock(eventRepo)
            .expects('save')
            .exactly(filmFromCOA.length);
        sandbox.mock(sellerRepo)
            .expects('search')
            .once()
            .resolves([seller]);
        sandbox.mock(eventRepo)
            .expects('searchScreeningEvents')
            .once()
            .resolves([]);

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: 'Project', id: 'id' },
            locationBranchCode: '123',
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo,
            seller: sellerRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('XMLエンドポイントからデータ取得するのはエラーが発生すれば処理を止まります', async () => {
        const movieTheater = {
            branchCode: '123',
            containsPlace: [
                { branchCode: '01' },
                { branchCode: '02' }
            ]
        };
        const seller = {
            additionalProperty: [
                { name: 'xmlEndPoint', value: '{"baseUrl":"http://cinema.coasystems.net","theaterCodeName":"aira"}' }
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
                screenCode: '01'
            },
            {
                titleCode: 'titleCode',
                titleBranchNum: 'titleBranchNum',
                screenCode: '02'
            }
        ];
        // const screeningEvent = {
        //     identifier: 'identifier'
        // };
        const eventRepo = new domain.repository.Event(mongoose.connection);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);

        sandbox.mock(COA.services.master)
            .expects('theater')
            .once()
            .resolves(
                { theaterCode: movieTheater.branchCode, theaterTelNum: '0312345678' }
            );
        sandbox.mock(COA.services.master)
            .expects('screen')
            .once()
            .resolves(movieTheater.containsPlace.map((p) => {
                return { screenCode: p.branchCode, listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] };
            }));
        sandbox.mock(COA.services.master)
            .expects('title')
            .once()
            .resolves(filmFromCOA);
        sandbox.mock(COA.services.master)
            .expects('schedule')
            .once()
            .resolves(schedulesFromCOA);
        sandbox.mock(COA.services.master)
            .expects('xmlSchedule')
            .once()
            .rejects(new Error('some random error'));
        sandbox.mock(COA.services.master)
            .expects('kubunName')
            .never();
        sandbox.mock(eventRepo)
            .expects('save')
            .never();
        sandbox.mock(sellerRepo)
            .expects('search')
            .once()
            .resolves([seller]);
        sandbox.mock(eventRepo)
            .expects('searchScreeningEvents')
            .never();

        const result = await MasterSyncService.importScreeningEvents({
            project: { typeOf: 'Project', id: 'id' },
            locationBranchCode: '123',
            importFrom: new Date(),
            importThrough: new Date()
        })({
            event: eventRepo,
            seller: sellerRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

// describe('importMovieTheater()', () => {
//     afterEach(() => {
//         sandbox.restore();
//     });

//     it('repositoryの状態が正常であれば、エラーにならないはず', async () => {
//         // const movieTheater = { branchCode: '', name: {} };
//         const sellerRepo = new domain.repository.Seller(mongoose.connection);
//         const placeRepo = new domain.repository.Place(mongoose.connection);

//         sandbox.stub(COA.services.master, 'theater')
//             .returns({ theaterTelNum: '0312345678' });
//         sandbox.stub(COA.services.master, 'screen')
//             .returns([{ listSeat: [{ seatSection: 'seatSection', seatNum: 'seatNum' }] }]);
//         sandbox.mock(placeRepo)
//             .expects('saveMovieTheater')
//             .once();
//         sandbox.mock(sellerRepo.organizationModel)
//             .expects('findOneAndUpdate')
//             .once()
//             .chain('exec')
//             .resolves();

//         const result = await MasterSyncService.importMovieTheater('123')({
//             seller: sellerRepo,
//             place: placeRepo
//         });

//         assert.equal(result, undefined);
//         sandbox.verify();
//     });
// });
