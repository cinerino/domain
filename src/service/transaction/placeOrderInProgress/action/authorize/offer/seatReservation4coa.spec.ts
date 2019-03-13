// tslint:disable:no-implicit-dependencies
/**
 * 座席予約オファー承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../../../../../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

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
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

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
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(domain.COA.services.master).expects('ticket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
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
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

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
                mvtkAppPrice: 1234,
                kbnEisyahousiki: '',
                mvtkNum: '',
                mvtkKbnDenshiken: '',
                mvtkKbnMaeuriken: '',
                mvtkKbnKensyu: '',
                mvtkSalesPrice: 1234
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const mvtkTicket = {
            ticketCode: 'ticketCode'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.master).expects('mvtkTicketcode').once().resolves(mvtkTicket);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        });

        assert.deepEqual(result, action);
        sandbox.verify();
    });

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
                mvtkAppPrice: 800,
                mvtkSalesPrice: 1000
            }
        }];
        const salesTickets: any[] = [];
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const mvtkTicket = {
            ticketCode: 'ticketCode',
            addPrice: 0,
            addPriceGlasses: 100
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.master).expects('mvtkTicketcode').once().resolves(mvtkTicket);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
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
        const reserveSeatsTemporarilyResult = <any>{};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        // 会員と非会員で2回呼ばれるはず
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').twice().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(reserveSeatsTemporarilyResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
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
                mvtkAppPrice: 123
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const mvtkTicketResult = {
            name: 'COAServiceError',
            code: 200
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        // ムビチケを券種に変換で失敗する場合
        sandbox.mock(domain.COA.services.master).expects('mvtkTicketcode').once().rejects(mvtkTicketResult);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
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
                mvtkAppPrice: 123
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const mvtkTicketResult = new Error('mvtkTicketResult');

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        // ムビチケを券種に変換でサーバーエラーの場合
        sandbox.mock(domain.COA.services.master).expects('mvtkTicketcode').once().rejects(mvtkTicketResult);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
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
                mvtkAppPrice: 123
            }
        }];
        const salesTickets = [{ ticketCode: 'ticketCode' }];
        const mvtkTicket = {
            ticketCode: 'ticketCode'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.master).expects('mvtkTicketcode').once().resolves(mvtkTicket);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
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

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
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

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').never();
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

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
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo).expects('giveUp').once()
            .resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.ServiceUnavailable);
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
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('updTmpReserveSeatResult');

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().rejects(updTmpReserveSeatResult);
        sandbox.mock(actionRepo).expects('giveUp').once().resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.ServiceUnavailable);
        sandbox.verify();
    });

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
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('座席取得失敗');

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo).expects('giveUp').once()
            .resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.AlreadyInUse);
        sandbox.verify();
    });

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
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');
        // tslint:disable-next-line:no-magic-numbers
        (<any>updTmpReserveSeatResult).code = 200;

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo).expects('giveUp').once()
            .resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    it('COA仮予約が500以上のエラーであれば、承認アクションを諦めて、Argumentエラーになるはず', async () => {
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
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };
        const updTmpReserveSeatResult = new Error('message');
        // tslint:disable-next-line:no-magic-numbers
        (<any>updTmpReserveSeatResult).code = 500;

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        // COAが座席取得失敗エラーを返してきた場合
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().rejects(updTmpReserveSeatResult);
        // giveUpが呼ばれて、completeは呼ばれないはず
        sandbox.mock(actionRepo).expects('giveUp').once()
            .resolves(action);
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.ServiceUnavailable);
        sandbox.verify();
    });

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

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').never();
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').never();
        sandbox.mock(actionRepo).expects('giveUp').never();
        sandbox.mock(actionRepo).expects('complete').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);
        assert(Array.isArray(result));
        assert(result[0] instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

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
        const updTmpReserveSeatResult = {};
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId'
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo).expects('start').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('updTmpReserveSeat').once().resolves(updTmpReserveSeatResult);
        sandbox.mock(actionRepo).expects('complete').once().resolves(action);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.create({
            agent: agent,
            transaction: transaction,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            event: eventRepo,
            action: actionRepo,
            transaction: transactionRepo
        });
        assert.deepEqual(result, action);
        sandbox.verify();
    });
});

describe('action.authorize.seatReservation.cancel()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すれば、キャンセルできるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            result: {
                requestBody: {},
                responseBody: {}
            }
        };
        const transaction = {
            id: 'transactionId',
            agent: agent,
            seller: seller
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('cancel').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('delTmpReserve').once().resolves();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.cancel({
            agent: agent,
            transaction: transaction,
            id: action.id
        })({
            action: actionRepo,
            transaction: transactionRepo
        });

        assert.equal(result, undefined);
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
        const actionId = 'actionId';
        const transaction = {
            id: 'transactionId',
            agent: {
                id: 'anotherAgentId'
            },
            seller: seller
        };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('cancel').never();
        sandbox.mock(domain.COA.services.reserve).expects('delTmpReserve').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.cancel({
            agent: agent,
            transaction: transaction,
            id: actionId
        })({
            action: actionRepo,
            transaction: transactionRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });
});

describe('action.authorize.seatReservation.changeOffers()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('COAが正常であれば、エラーにならないはず', async () => {
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
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: {
                event: event,
                acceptedOffer: offers
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(actionRepo).expects('findById').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo.actionModel).expects('findOneAndUpdate').once().chain('exec').resolves(new actionRepo.actionModel(action));

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        });

        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('取引主体が一致しなければ、Forbiddenエラーになるはず', async () => {
        const agent = {
            id: 'agentId'
        };
        const seller = {
            id: 'sellerId',
            name: { ja: 'ja', en: 'ne' }
        };
        const transaction = {
            id: 'transactionId',
            agent: { id: 'invalidAgentId' },
            seller: seller
        };
        const eventId = 'eventId';
        const event = {
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const action = {
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: {
                event: event,
                acceptedOffer: offers
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').never();
        sandbox.mock(actionRepo).expects('findById').never();
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.Forbidden);
        sandbox.verify();
    });

    it('アクションが完了ステータスでなければ、NotFoundエラーになるはず', async () => {
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
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.ActiveActionStatus,
            object: {
                event: event,
                acceptedOffer: offers
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('findById').once().resolves(action);
        sandbox.mock(eventRepo).expects('findById').never();
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        assert.equal((<domain.factory.errors.NotFound>result).entityName, 'authorizeAction');
        sandbox.verify();
    });

    it('イベント識別子が一致しなければ、Argumentエラーになるはず', async () => {
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
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: {
                event: {
                    id: 'invalidEventId'
                },
                acceptedOffer: offers
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('findById').once().resolves(action);
        sandbox.mock(eventRepo).expects('findById').never();
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    it('座席が一致していなければ、Argumentエラーになるはず', async () => {
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
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: {
                event: event,
                acceptedOffer: [{
                    seatSection: 'seatSection',
                    seatNumber: 'invalidSeatNumber'
                }]
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(actionRepo).expects('findById').once().resolves(action);
        sandbox.mock(eventRepo).expects('findById').never();
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').never();

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        }).catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        assert.equal((<domain.factory.errors.Argument>result).argumentName, 'offers');
        sandbox.verify();
    });

    it('アクション変更のタイミングでCompletedActionStatusのアクションが存在しなければNotFoundエラーとなるはず', async () => {
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
            id: eventId,
            coaInfo: {}
        };
        const offers = [{
            seatSection: 'seatSection',
            seatNumber: 'seatNumber',
            ticketInfo: {
                ticketCode: 'ticketCode'
            }
        }];
        const salesTickets = [{ ticketCode: offers[0].ticketInfo.ticketCode }];
        const action = {
            typeOf: domain.factory.actionType.AuthorizeAction,
            id: 'actionId',
            actionStatus: domain.factory.actionStatusType.CompletedActionStatus,
            object: {
                event: event,
                acceptedOffer: offers
            },
            result: {}
        };

        const eventRepo = new domain.repository.Event(mongoose.connection);
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(transactionRepo).expects('findInProgressById').once().resolves(transaction);
        sandbox.mock(eventRepo).expects('findById').once().resolves(event);
        sandbox.mock(actionRepo).expects('findById').once().resolves(action);
        sandbox.mock(domain.COA.services.reserve).expects('salesTicket').once().resolves(salesTickets);
        sandbox.mock(actionRepo.actionModel).expects('findOneAndUpdate').once().chain('exec').resolves(null);

        const result = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation4coa.changeOffers({
            agent: agent,
            transaction: transaction,
            id: action.id,
            object: {
                event: { id: eventId },
                acceptedOffer: <any>offers
            }
        })({
            action: actionRepo,
            transaction: transactionRepo,
            event: eventRepo
        }).catch((err) => err);

        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});