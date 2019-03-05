// tslint:disable:no-implicit-dependencies
/**
 * 注文リポジトリーテスト
 */
import { } from 'mocha';
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('createIfNotExist()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、作成できるはず', async () => {
        const order = {};

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel).expects('findOneAndUpdate').once()
            .chain('exec').resolves(new repository.orderModel());

        const result = await repository.createIfNotExist(<any>order);

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('changeStatus()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('注文が存在すればステータス変更できるはず', async () => {
        const orderNumber = 'orderNumber';
        const orderStatus = domain.factory.orderStatus.OrderDelivered;

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel).expects('findOneAndUpdate').once()
            .chain('exec').resolves(new repository.orderModel());

        const result = await repository.changeStatus({ orderNumber: orderNumber, orderStatus: orderStatus });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('注文が存在しなければNotFoundエラーとなるはず', async () => {
        const orderNumber = 'orderNumber';
        const orderStatus = domain.factory.orderStatus.OrderDelivered;

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel).expects('findOneAndUpdate').once()
            .chain('exec').resolves(null);

        const result = await repository.changeStatus({ orderNumber: orderNumber, orderStatus: orderStatus })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('findByOrderNumber()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('注文が存在すれば注文オブジェクトが返却されるはず', async () => {
        const order = {
            orderNumber: 'orderNumber'
        };

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel).expects('findOne').once()
            .chain('exec').resolves(new repository.orderModel(order));

        const result = await repository.findByOrderNumber({ orderNumber: order.orderNumber });

        assert.equal(result.orderNumber, order.orderNumber);
        sandbox.verify();
    });

    it('注文が存在しなければNotFoundエラーとなるはず', async () => {
        const orderNumber = 'orderNumber';

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel).expects('findOne').once()
            .chain('exec').resolves(null);

        const result = await repository.findByOrderNumber({ orderNumber: orderNumber })
            .catch((err) => err);

        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('注文を検索する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であれば配列を取得できるはず', async () => {
        const orderRepo = new domain.repository.Order(mongoose.connection);
        sandbox.mock(orderRepo.orderModel).expects('find').once()
            // .chain('sort')
            .chain('exec')
            .resolves([new orderRepo.orderModel()]);
        const result = await orderRepo.search({
            seller: {
                typeOf: domain.factory.organizationType.MovieTheater,
                ids: ['sellerId']
            },
            customer: {
                typeOf: domain.factory.personType.Person,
                membershipNumbers: ['customerMembershipNumber']
            },
            orderNumbers: ['orderNumber'],
            orderStatuses: [domain.factory.orderStatus.OrderCancelled],
            orderDateFrom: new Date(),
            orderDateThrough: new Date(),
            confirmationNumbers: ['confirmationNumber']
        });
        assert(Array.isArray(result));
        sandbox.verify();
    });
});

describe('findByLocationBranchCodeAndReservationNumber()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('注文が存在すれば、取得できるはず', async () => {
        const orderInquiryKey = {
            theaterCode: '111',
            reservationNumber: 123,
            telephone: '+819012345678'
        };

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(new repository.orderModel());

        const result = await repository.findByLocationBranchCodeAndReservationNumber(orderInquiryKey);

        assert.notEqual(result, undefined);
        sandbox.verify();
    });

    it('存在しなければ、NotFoundエラーとなるはず', async () => {
        const orderInquiryKey = {
            theaterCode: '111',
            reservationNumber: 123,
            telephone: '+819012345678'
        };

        const repository = new domain.repository.Order(mongoose.connection);

        sandbox.mock(repository.orderModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.findByLocationBranchCodeAndReservationNumber(orderInquiryKey)
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});
