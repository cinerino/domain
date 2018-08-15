// tslint:disable:no-implicit-dependencies
/**
 * 健康レポートサービステスト
 */
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

// 健康なGMO通知
let healthGMONotifications: any[];
// 健康な支払アクション
let healthyPayActions: any[];

before(() => {
    sandbox = sinon.createSandbox();
});

describe('service.report.health.checkGMOSales()', () => {
    beforeEach(() => {
        healthGMONotifications = [{
            accessId: 'accessId',
            orderId: 'orderId',
            status: 'status',
            jobCd: 'jobCd',
            amount: 1234,
            payType: 'payType',
            approve: 'approve'
        }];
        healthyPayActions = [{
            object: {
                paymentMethod: {
                    paymentMethodId: 'orderId'
                },
                price: 1234
            },
            result: {
                creditCardSales: {
                    accessId: 'accessId',
                    approve: 'approve'
                }
            }
        }];
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('全て健康であれば、不健康リストはないはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const actions = healthyPayActions;

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 0);
        sandbox.verify();
    });

    it('オーダーIDに該当する取引がなければ不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        unhealthPayAction.object.paymentMethod.paymentMethodId = 'invalid';
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });

    it('アクセスIDが異なれば不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        unhealthPayAction.result.creditCardSales.accessId = 'invalid';
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });

    it('承認番号が異なれば不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        // tslint:disable-next-line:no-magic-numbers
        unhealthPayAction.result.creditCardSales.approve = 'invalid';
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });

    it('金額が異なれば不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        // tslint:disable-next-line:no-magic-numbers
        unhealthPayAction.object.price = 9999999;
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });

    it('支払アクション結果が未定義であれば不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        // tslint:disable-next-line:no-magic-numbers
        unhealthPayAction.result = undefined;
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });

    it('支払アクション結果にc売上結果がなければ不健康なはず', async () => {
        const madeFrom = new Date();
        const madeThrough = new Date();
        const notifications = healthGMONotifications;
        const unhealthPayAction = healthyPayActions[0];
        // tslint:disable-next-line:no-magic-numbers
        unhealthPayAction.result = { test: 'test' };
        const actions = [unhealthPayAction];

        const gmoNotificationRepo = new domain.repository.GMONotification(domain.mongoose.connection);
        const actionRepo = new domain.repository.Action(domain.mongoose.connection);

        sandbox.mock(gmoNotificationRepo.gmoNotificationModel).expects('find').once()
            .chain('lean').chain('exec').resolves(notifications);
        sandbox.mock(actionRepo.actionModel).expects('find').once()
            .chain('exec').resolves(actions.map((a) => new actionRepo.actionModel(a)));

        const result = await domain.service.report.health.checkGMOSales(madeFrom, madeThrough)({
            gmoNotification: gmoNotificationRepo,
            action: actionRepo
        });
        assert.equal(typeof result, 'object');
        assert.equal(result.unhealthGMOSales.length, 1);
        sandbox.verify();
    });
});
