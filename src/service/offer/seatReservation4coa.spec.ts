// tslint:disable:no-implicit-dependencies
/**
 * 座席予約オファー承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

const project = {
    typeOf: <domain.factory.chevre.organizationType.Project>domain.factory.chevre.organizationType.Project,
    id: 'id'
};

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('action.authorize.seatReservation.create()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('COAが正常であれば、エラーにならないはず(ムビチケなし)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode',
                addGlasses: 1234
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COAが正常であれば、エラーにならないはず(無料鑑賞券の場合)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode',
                usePoint: 10,
                addGlasses: 1234
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.chevre.service.Offer.prototype)
            .expects('search')
            .once()
            .resolves({ data: [] });
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('ticket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });
        assert.deepEqual(result, action);
        sandbox.verify();
    });

    it('メガネ代込みを指定された場合、メガネ代込みの承認アクションを取得できるはず(ムビチケなし)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode',
                addGlasses: 100
            }
        }];
        const salesTickets = [{
            ticketCode: 'ticketCode',
            salePrice: 1000,
            addGlasses: 100
        }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COAが正常であれば、エラーにならないはず(ムビチケの場合)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode',
                mvtkAppPrice: 0,
                kbnEisyahousiki: '',
                mvtkNum: '12345',
                mvtkKbnDenshiken: '',
                mvtkKbnMaeuriken: '',
                mvtkKbnKensyu: '',
                mvtkSalesPrice: 1234
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const mvtkTicket = {
            ticketCode: 'ticketCode'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('mvtkTicketcode')
            .once()
            .resolves(mvtkTicket);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('ムビチケでメガネ代込みを指定された場合、メガネ代込みの承認アクションを取得できるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode',
                addGlasses: 100,
                mvtkAppPrice: 0,
                mvtkSalesPrice: 1000,
                mvtkNum: '12345'
            }
        }];
        const salesTickets: any[] = [];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const mvtkTicket = {
            ticketCode: 'ticketCode',
            addPrice: 0,
            addPriceGlasses: 100
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('mvtkTicketcode')
            .once()
            .resolves(mvtkTicket);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    it('COAが正常であれば、エラーにならないはず(会員の場合)', async () => {
        const agent = {
            id: 'agentId',
            memberOf: {} // 会員
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const reserveSeatsTemporarilyResult = <any>{ listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        // 会員と非会員で2回呼ばれるはず
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .twice()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

    it('ムビチケ情報をCOA券種に変換できなければ、NotFoundErrorになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'invalidTicketCode',
                mvtkAppPrice: 0,
                mvtkNum: '12345'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const mvtkTicketResult = {
            name: 'COAServiceError',
            code: 200
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        // ムビチケを券種に変換で失敗する場合
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('mvtkTicketcode')
            .once()
            .rejects(mvtkTicketResult);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('ムビチケ情報のCOA券種への変換でサーバーエラーであれば、そのままのエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'invalidTicketCode',
                mvtkAppPrice: 0,
                mvtkNum: '12345'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const mvtkTicketResult = new Error('mvtkTicketResult');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        // ムビチケを券種に変換でサーバーエラーの場合
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('mvtkTicketcode')
            .once()
            .rejects(mvtkTicketResult);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, mvtkTicketResult);
        sandbox.verify();
    });

    it('券種情報の券種コードと券種情報から変換した券種コードが一致しなければ、NotFoundErrorになるはず(ムビチケの場合)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'invalidTicketCode',
                mvtkAppPrice: 0,
                mvtkNum: '12345'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const mvtkTicket = {
            ticketCode: 'ticketCode'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Master.prototype)
            .expects('mvtkTicketcode')
            .once()
            .resolves(mvtkTicket);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('存在しないチケットコードであれば、エラーになるはず(ムビチケなし)', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'invalidTicketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('所有者の取引でなければ、Forbiddenエラーが投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: {
                id: 'anotherAgentId'
            },
            seller: seller
        };
        const eventId = 'eventId';
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                mvtkSalesPrice: 123
            }
        }];

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .never();
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .never();
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COA仮予約が原因不明のサーバーエラーであれば、承認アクションを諦めて、ServiceUnavailableエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, updTmpReserveSeatResult);
        sandbox.verify();
    });

    it('COA仮予約でエラーオブジェクトでない例外が発生すれば、承認アクションを諦めて、ServiceUnavailableエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('updTmpReserveSeatResult');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .rejects(updTmpReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, updTmpReserveSeatResult);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COA仮予約が座席重複エラーであれば、承認アクションを諦めて、AlreadyInUseエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('既に予約済みです');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.AlreadyInUse);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COA仮予約が500未満のエラーであれば、承認アクションを諦めて、Argumentエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');
        // tslint:disable-next-line:no-magic-numbers
        (<any>updTmpReserveSeatResult).code = 200;

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('COA仮予約が500以上のエラーであれば、承認アクションを諦めて、ServiceUnavailableエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: [{ seatNum: 'seatNumber' }]
            }]
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');
        // tslint:disable-next-line:no-magic-numbers
        (<any>updTmpReserveSeatResult).code = 500;

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.ServiceUnavailable);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('制限単位がn人単位の券種が指定された場合、割引条件を満たしていなければ、Argumentエラー配列が投げられるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber1',
                ticketInfo: {
                    ticketCode: 'ticketCode'
                }
            },
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber2',
                ticketInfo: {
                    ticketCode: 'ticketCode'
                }
            },
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber3',
                ticketInfo: {
                    ticketCode: 'ticketCode2'
                }
            },
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber4',
                ticketInfo: {
                    ticketCode: 'ticketCode'
                }
            }
        ];
        const salesTickets = [{
            ticketCode: 'ticketCode',
            limitUnit: '001',
            limitCount: 2 // 2枚単位の制限
        }];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: offers.map((o) => {
                    return { seatNum: o.seatNumber };
                })
            }]
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert(Array.isArray(result));
        assert(result[0] instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('制限単位がn人単位の券種が指定された場合、割引条件を満たしていれば、承認アクションを取得できるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            project: { id: '' },
            id: eventId,
            coaInfo: {
                theaterCode: 'theaterCode'
            }
        };
        const offers = [
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber1',
                ticketInfo: {
                    ticketCode: 'ticketCode'
                }
            },
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber2',
                ticketInfo: {
                    ticketCode: 'ticketCode'
                }
            },
            {
                seatSection: 'seatSection',
                seatNumber: 'seatNumber4',
                ticketInfo: {
                    ticketCode: 'ticketCode2'
                }
            }
        ];
        const salesTickets = [
            {
                ticketCode: 'ticketCode',
                limitUnit: '001',
                limitCount: 2 // 2枚単位の制限
            },
            {
                ticketCode: 'ticketCode2'
            }
        ];
        const stateReserveSeatResult = {
            listSeat: [{
                seatSection: 'seatSection',
                listFreeSeat: offers.map((o) => {
                    return { seatNum: o.seatNumber };
                })
            }]
        };
        const updTmpReserveSeatResult = { listTmpReserve: [] };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(domain.chevre.service.Event.prototype)
            .expects('findById')
            .once()
            .resolves(event);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('salesTicket')
            .once()
            .resolves(salesTickets);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('stateReserveSeat')
            .once()
            .resolves(stateReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.service.Reserve.prototype)
            .expects('updTmpReserveSeat')
            .once()
            .resolves(updTmpReserveSeatResult);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);

        const result = await domain.service.offer.seatReservation4coa.create({
            project: project,
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            project: projectRepo,
            transaction: transactionRepo
        });
        assert.deepEqual(result, action);
        sandbox.verify();
    });
});
