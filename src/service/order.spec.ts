// tslint:disable:no-implicit-dependencies
/**
 * 注文サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('returnOrder()', () => {
    beforeEach(() => {
        process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN = 'https://example.com';
        process.env.CHEVRE_CLIENT_ID = 'xxx';
        process.env.CHEVRE_CLIENT_SECRET = 'xxx';
    });

    afterEach(() => {
        delete process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN;
        delete process.env.CHEVRE_CLIENT_ID;
        delete process.env.CHEVRE_CLIENT_SECRET;

        sandbox.restore();
    });

    it('アクションを完了できるはず', async () => {
        const project = { id: '', settings: { chevre: {} } };
        const order = {
            customer: { telephone: '+819096793896' },
            acceptedOffers: [
                {
                    itemOffered: {
                        typeOf: domain.factory.chevre.reservationType.EventReservation,
                        reservationNumber: '123',
                        reservationFor: { superEvent: { location: { branchCode: '123' } } }
                    },
                    offeredThrough: { identifier: domain.factory.service.webAPI.Identifier.COA }
                }
            ],
            orderNumber: 'orderNumber'
        };
        const placeOrderTransaction = {
            id: 'id',
            object: {
                authorizeActions: []
            }
        };
        const returnOrderTransaction = {
            id: 'id',
            object: { order },
            result: {},
            potentialActions: {
                returnOrder: {
                    typeOf: domain.factory.actionType.ReturnAction,
                    object: order,
                    potentialActions: {
                        refundCreditCard: [{}],
                        refundAccount: [{}],
                        returnPointAward: [{}]
                    }
                }
            }
        };
        const action = { id: 'actionId', typeOf: returnOrderTransaction.potentialActions.returnOrder.typeOf };
        const stateReserveResult = {};

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const orderRepo = new domain.repository.Order(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('search')
            .twice()
            .onFirstCall()
            .resolves([returnOrderTransaction])
            .onSecondCall()
            .resolves([placeOrderTransaction]);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .never();
        sandbox.mock(domain.COA.services.reserve)
            .expects('stateReserve')
            .once()
            .resolves(stateReserveResult);
        sandbox.mock(domain.COA.services.reserve)
            .expects('delReserve')
            .once()
            .resolves();
        sandbox.mock(orderRepo)
            .expects('returnOrder')
            .once()
            .resolves();
        sandbox.mock(taskRepo)
            .expects('save')
            // tslint:disable-next-line:no-magic-numbers
            .exactly(3);

        const result = await domain.service.order.returnOrder(order)({
            action: actionRepo,
            order: orderRepo,
            ownershipInfo: ownershipInfoRepo,
            project: projectRepo,
            transaction: transactionRepo,
            task: taskRepo
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('COA予約内容抽出に失敗すればアクションにエラー結果が追加されるはず', async () => {
        const project = { id: '', settings: { chevre: {} } };
        const order = {
            customer: { telephone: '+819096793896' },
            acceptedOffers: [
                {
                    itemOffered: {
                        typeOf: domain.factory.chevre.reservationType.EventReservation,
                        reservationNumber: '123',
                        reservationFor: { superEvent: { location: { branchCode: '123' } } }
                    },
                    offeredThrough: { identifier: domain.factory.service.webAPI.Identifier.COA }
                }
            ],
            orderNumber: 'orderNumber'
        };
        const returnOrderTransaction = {
            id: 'id',
            object: { order },
            result: {},
            potentialActions: {
                returnOrder: {
                    typeOf: domain.factory.actionType.ReturnAction,
                    object: order,
                    potentialActions: {
                        refundCreditCard: [{}],
                        refundAccount: [{}],
                        returnPointAward: [{}]
                    }
                }
            }
        };
        const action = { id: 'actionId', typeOf: returnOrderTransaction.potentialActions.returnOrder.typeOf };
        const stateReserveResult = new Error('stateReserveError');

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const orderRepo = new domain.repository.Order(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(transactionRepo)
            .expects('search')
            .twice()
            .onFirstCall()
            .resolves([returnOrderTransaction])
            .onSecondCall()
            .resolves([{}]);
        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves(action);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves(action);
        sandbox.mock(domain.COA.services.reserve)
            .expects('stateReserve')
            .once()
            .rejects(stateReserveResult);

        const result = await domain.service.order.returnOrder(order)({
            action: actionRepo,
            order: orderRepo,
            ownershipInfo: ownershipInfoRepo,
            project: projectRepo,
            transaction: transactionRepo,
            task: taskRepo
        })
            .catch((err) => err);

        assert.deepEqual(result, stateReserveResult);
        sandbox.verify();
    });
});
