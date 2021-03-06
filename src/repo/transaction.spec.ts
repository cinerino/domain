// tslint:disable:no-implicit-dependencies
/**
 * 取引リポジトリテスト
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

describe('start()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('repositoryの状態が正常であれば、開始できるはず', async () => {
        const transaction = { typeOf: domain.factory.transactionType.PlaceOrder, id: 'id' };
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('create')
            .once()
            .resolves(new repository.transactionModel());

        const result = await repository.start(<any>transaction);
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});

describe('updateAgent()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('取引が存在すれば、エラーにならないはず', async () => {
        const transactionId = 'transactionId';
        const contact = {};
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.transactionModel());

        const result = await repository.updateAgent({
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: transactionId,
            agent: <any>contact
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('取引が存在しなければ、NotFoundエラーになるはず', async () => {
        const transactionId = 'transactionId';
        const contact = {};

        const repository = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.updateAgent({
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: transactionId,
            agent: <any>contact
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('confirm()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('取引が存在すれば、エラーにならないはず', async () => {
        const transactionId = 'transactionId';
        const authorizeActions: any[] = [];
        const transactionResult = {};
        const potentialActions = {};
        const repository = new domain.repository.Transaction(mongoose.connection);
        const doc = new repository.transactionModel();
        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(doc);

        const result = await repository.confirm({
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: transactionId,
            authorizeActions: authorizeActions,
            result: <any>transactionResult,
            potentialActions: <any>potentialActions
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});

describe('reexportTasks()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、エラーにならないはず', async () => {
        const intervalInMinutes = 10;
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.transactionModel());

        const result = await repository.reexportTasks({ intervalInMinutes: intervalInMinutes });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('setTasksExportedById()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、エラーにならないはず', async () => {
        const transactionId = 'transactionId';
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('findByIdAndUpdate')
            .once()
            .withArgs(transactionId)
            .chain('exec')
            .resolves(new repository.transactionModel());

        const result = await repository.setTasksExportedById({ id: transactionId });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('makeExpired()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBの状態が正常であれば、エラーにならないはず', async () => {
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('updateMany')
            .once()
            .chain('exec')
            .resolves();

        const result = await repository.makeExpired({});
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('startExportTasks()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('タスク未出力の取引が存在すればオブジェクトが返却されるはず', async () => {
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            status: domain.factory.transactionStatusType.Confirmed
        };
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.transactionModel());

        const result = await repository.startExportTasks({ typeOf: { $in: [transaction.typeOf] }, status: transaction.status });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('タスク未出力の取引が存在しなければnullを返却するはず', async () => {
        const transaction = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId',
            status: domain.factory.transactionStatusType.Confirmed
        };
        const repository = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(repository.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.startExportTasks({ typeOf: { $in: [transaction.typeOf] }, status: transaction.status });
        assert.equal(result, null);
        sandbox.verify();
    });
});

describe('IDで取引を取得する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('取引が存在すればオブジェクトを取得できるはず', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(new transactionRepo.transactionModel());

        const result = await transactionRepo.findById({ typeOf: domain.factory.transactionType.PlaceOrder, id: 'transactionId' });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('取引が存在しなければNotFoundエラー', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await transactionRepo.findById({ typeOf: domain.factory.transactionType.PlaceOrder, id: 'transactionId' })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('IDで進行中取引を取得する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('取引が存在すればオブジェクトを取得できるはず', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(new transactionRepo.transactionModel());

        const result = await transactionRepo.findInProgressById({ typeOf: domain.factory.transactionType.PlaceOrder, id: 'transactionId' });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('取引が存在しなければNotFoundエラー', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await transactionRepo.findInProgressById({ typeOf: domain.factory.transactionType.PlaceOrder, id: 'transactionId' })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('取引を中止する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('進行中取引が存在すれば中止できるはず', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new transactionRepo.transactionModel());

        const result = await transactionRepo.cancel({
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId'
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('進行中取引が存在しなければNotFoundエラー', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await transactionRepo.cancel({
            typeOf: domain.factory.transactionType.PlaceOrder,
            id: 'transactionId'
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('取引を検索する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であれば注文取引配列を取得できるはず', async () => {
        const searchConditions = {
            typeOf: domain.factory.transactionType.PlaceOrder,
            ids: [],
            statuses: [],
            agent: {
                typeOf: '',
                ids: [],
                identifiers: [],
                givenName: '',
                familyName: '',
                telephone: '',
                email: ''
            },
            startFrom: new Date(),
            startThrough: new Date(),
            endFrom: new Date(),
            endThrough: new Date(),
            seller: {
                typeOf: '',
                ids: []
            },
            object: {},
            result: {
                order: {
                    orderNumbers: []
                }
            },
            tasksExportationStatuses: [domain.factory.transactionTasksExportationStatus.Exported],
            limit: 10,
            sort: { startDate: domain.factory.sortType.Ascending }
        };
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves([new transactionRepo.transactionModel()]);

        const result = await transactionRepo.search(<any>searchConditions);
        assert(Array.isArray(result));
        sandbox.verify();
    });

    it('MongoDBが正常であれば返品注文取引配列を取得できるはず', async () => {
        const searchConditions = {
            typeOf: domain.factory.transactionType.ReturnOrder,
            object: {
                order: {
                    orderNumbers: []
                }
            }
        };
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves([new transactionRepo.transactionModel()]);

        const result = await transactionRepo.search(<any>searchConditions);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});

describe('取引をカウントする', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であれば数字を取得できるはず', async () => {
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo.transactionModel)
            .expects('countDocuments')
            .once()
            .chain('exec')
            .resolves(1);

        const result = await transactionRepo.count({
            typeOf: domain.factory.transactionType.PlaceOrder,
            startFrom: new Date(),
            startThrough: new Date()
        });
        assert(Number.isInteger(result));
        sandbox.verify();
    });
});
