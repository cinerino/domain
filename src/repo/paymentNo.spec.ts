// tslint:disable:no-implicit-dependencies
/**
 * 購入番号リポジトリーテスト
 */
import { } from 'mocha';
import * as moment from 'moment';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.sandbox.create();
});

describe('購入番号を発行する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('redisが正常であれば数字のみで構成された文字列を取得できるはず', async () => {
        const date = moment()
            .format('YYYYMMDD');
        const redisClient = redis.createClient();
        const multi = redisClient.multi();
        const execResult = [0, 1];

        const paymentNoRespo = new domain.repository.PaymentNo(redisClient);
        sandbox.mock(redisClient)
            .expects('multi')
            .once()
            .returns(multi);
        sandbox.mock(multi)
            .expects('exec')
            .once()
            .callsArgWith(0, null, execResult);

        const result = await paymentNoRespo.publish(date);
        assert(/^[0-9]+$/.test(result));
        sandbox.verify();
    });

    it('redisでエラーが発生すれば、そのままエラーとなるはず', async () => {
        const date = moment()
            .format('YYYYMMDD');
        const redisClient = redis.createClient();
        const multi = redisClient.multi();
        const execResult = new Error('redis error');

        const paymentNoRespo = new domain.repository.PaymentNo(redisClient);
        sandbox.mock(redisClient)
            .expects('multi')
            .once()
            .returns(multi);
        sandbox.mock(multi)
            .expects('exec')
            .once()
            .callsArgWith(0, execResult);

        const result = await paymentNoRespo.publish(date)
            .catch((err) => err);
        assert.deepEqual(result, execResult);
        sandbox.verify();
    });

    it('redisでのインクリメント結果が数字でなければ、ServiceUnavailable', async () => {
        const date = moment()
            .format('YYYYMMDD');
        const redisClient = redis.createClient();
        const multi = redisClient.multi();
        const execResult = ['0', 1];

        const paymentNoRespo = new domain.repository.PaymentNo(redisClient);
        sandbox.mock(redisClient)
            .expects('multi')
            .once()
            .returns(multi);
        sandbox.mock(multi)
            .expects('exec')
            .once()
            .callsArgWith(0, null, execResult);

        const result = await paymentNoRespo.publish(date)
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.ServiceUnavailable);
        sandbox.verify();
    });

    it('日付フォーマットが適切でなければArgumentエラー', async () => {
        const date = moment()
            .format('YYYY');
        const redisClient = redis.createClient();

        const paymentNoRespo = new domain.repository.PaymentNo(redisClient);
        sandbox.mock(redisClient)
            .expects('multi')
            .never();

        const result = await paymentNoRespo.publish(date)
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});

describe('購入番号のためのチェックディジットを求める', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('1桁の数字を取得できるはず', async () => {
        const source = '1'.repeat(domain.repository.PaymentNo.MAX_LENGTH_OF_SEQUENCE_NO);
        const result = domain.repository.PaymentNo.GET_CHECK_DIGIT(source);
        assert(Number.isInteger(result));
        assert(/^\d{1}$/.test(result.toString()));
        sandbox.verify();
    });

    it('対象文字列の長さが適切でなければArgumentエラー', async () => {
        const source = '1'.repeat(domain.repository.PaymentNo.MAX_LENGTH_OF_SEQUENCE_NO - 1);
        assert.throws(
            () => {
                domain.repository.PaymentNo.GET_CHECK_DIGIT(source);
            },
            domain.factory.errors.Argument
        );
        sandbox.verify();
    });
});

describe('購入番号の有効性チェック', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('有効であればtrueが返るはず', async () => {
        const paymentNo = '130028';
        const result = domain.repository.PaymentNo.VALIDATE(paymentNo);
        assert(result === true);
        sandbox.verify();
    });

    it('購入番号の長さが適切でなければfalse', async () => {
        const paymentNo = '1'.repeat(domain.repository.PaymentNo.MAX_LENGTH_OF_SEQUENCE_NO);
        const result = domain.repository.PaymentNo.VALIDATE(paymentNo);
        assert(result === false);
        sandbox.verify();
    });
});
