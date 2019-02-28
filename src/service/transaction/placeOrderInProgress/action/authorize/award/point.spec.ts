// tslint:disable:no-implicit-dependencies
/**
 * ポイントインセンティブ承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as sskts from '../../../../../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('ポイントインセンティブ承認を作成する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であればアクションを完了できるはず', async () => {
        const transaction = {
            agent: { memberOf: {} },
            seller: { name: {} }
        };
        const actionRepo = new sskts.repository.Action(mongoose.connection);
        const transactionRepo = new sskts.repository.Transaction(mongoose.connection);
        const ownershipInfoRepo = new sskts.repository.OwnershipInfo(mongoose.connection);
        const depositService = new sskts.pecorinoapi.service.transaction.Deposit(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(depositService)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await sskts.service.transaction.placeOrderInProgress.action.authorize.award.point.create({
            transaction: <any>transaction,
            agent: <any>{},
            object: <any>{}
        })({
            action: actionRepo,
            transaction: transactionRepo,
            ownershipInfo: ownershipInfoRepo,
            depositTransactionService: depositService
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('会員でなければForbiddenエラーとなるはず', async () => {
        const transaction = {
            agent: {},
            seller: { name: {} }
        };
        const actionRepo = new sskts.repository.Action(mongoose.connection);
        const transactionRepo = new sskts.repository.Transaction(mongoose.connection);
        const ownershipInfoRepo = new sskts.repository.OwnershipInfo(mongoose.connection);
        const depositService = new sskts.pecorinoapi.service.transaction.Deposit(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();

        const result = await sskts.service.transaction.placeOrderInProgress.action.authorize.award.point.create({
            transaction: <any>transaction,
            agent: <any>{},
            object: <any>{}
        })({
            action: actionRepo,
            transaction: transactionRepo,
            ownershipInfo: ownershipInfoRepo,
            depositTransactionService: depositService
        })
            .catch((err) => err);
        assert(result instanceof sskts.factory.errors.Forbidden);
        sandbox.verify();
    });

    it('Pecorinoサービスでエラーが発生すればアクションを断念するはず', async () => {
        const transaction = {
            agent: { memberOf: {} },
            seller: { name: {} }
        };
        const pecorinoError = { name: 'PecorinoRequestError' };
        const actionRepo = new sskts.repository.Action(mongoose.connection);
        const transactionRepo = new sskts.repository.Transaction(mongoose.connection);
        const ownershipInfoRepo = new sskts.repository.OwnershipInfo(mongoose.connection);
        const depositService = new sskts.pecorinoapi.service.transaction.Deposit(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(depositService)
            .expects('start')
            .once()
            .rejects(pecorinoError);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});

        const result = await sskts.service.transaction.placeOrderInProgress.action.authorize.award.point.create({
            transaction: <any>transaction,
            agent: <any>{},
            object: <any>{}
        })({
            action: actionRepo,
            transaction: transactionRepo,
            ownershipInfo: ownershipInfoRepo,
            depositTransactionService: depositService
        })
            .catch((err) => err);
        assert(result instanceof sskts.factory.errors.Cinerino);
        sandbox.verify();
    });
});

describe('ポイントインセンティブ承認を取り消す', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorinoサービスが正常であれば取消できるはず', async () => {
        const transaction = {
            agent: { memberOf: {} },
            seller: { name: {} }
        };
        const action = { result: { pointTransaction: {} } };
        const actionRepo = new sskts.repository.Action(mongoose.connection);
        const transactionRepo = new sskts.repository.Transaction(mongoose.connection);
        const depositService = new sskts.pecorinoapi.service.transaction.Deposit(<any>{});
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(actionRepo)
            .expects('cancel')
            .once()
            .resolves(action);
        sandbox.mock(depositService)
            .expects('cancel')
            .once()
            .resolves();

        const result = await sskts.service.transaction.placeOrderInProgress.action.authorize.award.point.cancel({
            id: 'id',
            agent: <any>{},
            transaction: <any>transaction
        })({
            action: actionRepo,
            transaction: transactionRepo,
            depositTransactionService: depositService
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
