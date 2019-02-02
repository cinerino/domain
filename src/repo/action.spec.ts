// tslint:disable:no-implicit-dependencies
/**
 * アクションリポジトリテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as sskts from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('start()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションオブジェクトが返却されるはず', async () => {
        const params = {};

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('create')
            .once()
            .resolves(new repository.actionModel());

        const result = await repository.start(<any>params);

        assert(typeof result, 'object');
        sandbox.verify();
    });
});

describe('complete()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すればオブジェクトが返却されるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };
        const actionResult = {};

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.actionModel());

        const result = await repository.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });

        assert(typeof result, 'object');
        sandbox.verify();
    });

    it('アクションが存在しなければNotFoundエラーとなるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };
        const actionResult = {};

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.complete({ typeOf: action.typeOf, id: action.id, result: actionResult })
            .catch((err) => err);

        assert(result instanceof sskts.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('cancel()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すればオブジェクトが返却されるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.actionModel());

        const result = await repository.cancel({ typeOf: action.typeOf, id: action.id });

        assert(typeof result, 'object');
        sandbox.verify();
    });

    it('アクションが存在しなければNotFoundエラーとなるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.cancel({ typeOf: action.typeOf, id: action.id })
            .catch((err) => err);

        assert(result instanceof sskts.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('giveUp()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すればオブジェクトが返却されるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };
        const error = {};

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(new repository.actionModel());

        const result = await repository.giveUp({ typeOf: action.typeOf, id: action.id, error: error });

        assert(typeof result, 'object');
        sandbox.verify();
    });

    it('アクションが存在しなければNotFoundエラーとなるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };
        const error = {};

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.giveUp({ typeOf: action.typeOf, id: action.id, error: error })
            .catch((err) => err);

        assert(result instanceof sskts.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('findById()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すればオブジェクトが返却されるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(new repository.actionModel());

        const result = await repository.findById({ typeOf: action.typeOf, id: action.id });

        assert(typeof result, 'object');
        sandbox.verify();
    });

    it('アクションが存在しなければNotFoundエラーとなるはず', async () => {
        const action = { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' };

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('findOne')
            .once()
            .chain('exec')
            .resolves(null);

        const result = await repository.findById({ typeOf: action.typeOf, id: action.id })
            .catch((err) => err);

        assert(result instanceof sskts.factory.errors.NotFound);
        sandbox.verify();
    });
});

describe('searchByOrderNumber()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('アクションが存在すればオブジェクト配列が返却されるはず', async () => {
        const orderNumber = 'orderNumber';
        const actions = [
            { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' },
            { typeOf: sskts.factory.actionType.OrderAction, id: 'actionId' }
        ];

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves(actions.map((a) => new repository.actionModel(a)));

        const result = await repository.searchByOrderNumber({ orderNumber });

        assert(Array.isArray(result));
        assert.equal(result.length, actions.length);
        sandbox.verify();
    });
});

describe('アクション目的から検索', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('配列が返却されるはず', async () => {
        const actions = [
            { id: 'actionId' }
        ];

        const repository = new sskts.repository.Action(sskts.mongoose.connection);

        sandbox.mock(repository.actionModel)
            .expects('find')
            .once()
            .chain('exec')
            .resolves(actions.map((a) => new repository.actionModel(a)));

        const result = await repository.searchByPurpose(<any>{ purpose: {}, sort: {} });
        assert(Array.isArray(result));
        assert.equal(result.length, actions.length);
        sandbox.verify();
    });
});
