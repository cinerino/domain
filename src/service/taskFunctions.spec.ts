// tslint:disable:no-implicit-dependencies
/**
 * taskFunctions test
 */
import * as AWS from 'aws-sdk';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
import * as domain from '../index';

import * as TaskFunctionsService from './taskFunctions';

let sandbox: sinon.SinonSandbox;
let chevreAuthClient: domain.chevre.auth.ClientCredentials;
let pecorinoAuthClient: domain.pecorinoapi.auth.ClientCredentials;
let redisClient: redis.RedisClient;
let cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

before(() => {
    sandbox = sinon.createSandbox();
    chevreAuthClient = new domain.chevre.auth.ClientCredentials(<any>{});
    pecorinoAuthClient = new domain.pecorinoapi.auth.ClientCredentials(<any>{});
    redisClient = redis.createClient();
    cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();
});

describe('TaskFunctionsService.cancelSeatReservation()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('仮予約解除サービスが正常であれば、エラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.stock).expects('cancelSeatReservationAuth').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.cancelSeatReservation(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.cancelCreditCard()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('クレジットカードオーソリ解除サービスが正常であれば、エラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.payment.creditCard).expects('cancelCreditCardAuth').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.cancelCreditCard(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.cancelAccount()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorino決済サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.payment.account).expects('cancelAccountAuth').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.cancelAccount(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.cancelPointAward()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('配送サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.delivery).expects('cancelPointAward').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.cancelPointAward(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.settleCreditCard()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('クレジットカード実売上サービスが正常であれば、エラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.payment.creditCard).expects('payCreditCard').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.payCreditCard(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.createOrder()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('注文作成サービスが正常であれば、エラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.order).expects('createFromTransaction').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.placeOrder(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.sendEmailMessage()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('通知サービスが正常であればエラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId',
            actionAttributes: {}
        };

        sandbox.mock(domain.service.notification).expects('sendEmailMessage').once()
            .withArgs(data.actionAttributes).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.sendEmailMessage(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.refundCreditCard()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('売上サービスが正常であればエラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.payment.creditCard).expects('refundCreditCard').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.refundCreditCard(<any>data)({ connection: domain.mongoose.connection });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.refundAccount()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('Pecorino決済サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.payment.account).expects('refundAccount').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.refundAccount(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.returnOrder()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('注文サービスが正常であればエラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.order).expects('cancelReservations').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.returnOrder(<any>data)({
            connection: domain.mongoose.connection,
            redisClient: redis.createClient(),
            chevreEndpoint: 'chevreEndpoint',
            chevreAuthClient: chevreAuthClient
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.sendOrder()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('配送サービスが正常であればエラーにならないはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.delivery).expects('sendOrder').once()
            .withArgs(data.transactionId).returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.sendOrder(<any>data)({
            connection: domain.mongoose.connection,
            redisClient: redis.createClient(),
            chevreEndpoint: 'chevreEndpoint',
            chevreAuthClient: chevreAuthClient
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.payAccount()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('決済サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.payment.account).expects('payAccount').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.payAccount(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });

        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('PecorinoAPIクライアントがセットされていなければエラーとなるはず', async () => {
        const data = {
            transactionId: 'transactionId'
        };

        sandbox.mock(domain.service.payment.account).expects('payAccount').never();

        const result = await TaskFunctionsService.payAccount(<any>data)({
            connection: domain.mongoose.connection
        }).catch((err) => err);

        assert(result instanceof Error);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.givePointAward()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('配送サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.delivery).expects('givePointAward').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.givePointAward(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.returnPointAward()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('配送サービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.delivery).expects('returnPointAward').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.returnPointAward(<any>data)({
            connection: domain.mongoose.connection,
            pecorinoEndpoint: 'pecorinoEndpoint',
            pecorinoAuthClient: pecorinoAuthClient
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.registerProgramMembership()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('会員プログラムサービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.programMembership).expects('register').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.registerProgramMembership(<any>data)({
            connection: domain.mongoose.connection,
            redisClient: redisClient,
            cognitoIdentityServiceProvider: cognitoIdentityServiceProvider
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('TaskFunctionsService.unRegisterProgramMembership()', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('会員プログラムサービスが正常であればエラーにならないはず', async () => {
        const data = {};
        sandbox.mock(domain.service.programMembership).expects('unRegister').once().returns(async () => Promise.resolve());

        const result = await TaskFunctionsService.unRegisterProgramMembership(<any>data)({
            connection: domain.mongoose.connection
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
