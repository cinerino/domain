// tslint:disable:no-implicit-dependencies
/**
 * イベント在庫状況リポジトリテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('findOne()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('データが存在してBufferとして取得できれば数値が返却されるはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const availability = 99;
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('hget').once().callsArgWith(2, null, availability.toString());

        const result = await repository.findOne(screeningDay, eventIdentifier);
        assert.equal(typeof result, 'number');
        assert.equal(result, availability);
        sandbox.verify();
    });

    it('データが存在して文字列として取得できれば数値が返却されるはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const availability = 99;
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('hget').once().callsArgWith(2, null, availability.toString());

        const result = await repository.findOne(screeningDay, eventIdentifier);
        assert.equal(typeof result, 'number');
        assert.equal(result, availability);
        sandbox.verify();
    });

    it('データが存在しなければ、nullが返却されるはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('hget').once().callsArgWith(2, null, null);

        const result = await repository.findOne(screeningDay, eventIdentifier);
        assert.equal(result, null);
        sandbox.verify();
    });

    it('Redisが正常でなければ、エラーが投げられるはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const redisError = new Error('manual error');
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('hget').once().callsArgWith(2, redisError, null);

        const result = await repository.findOne(screeningDay, eventIdentifier).catch((err) => err);
        assert.equal(result, redisError);
        sandbox.verify();
    });
});

describe('updateOne()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisの状態が正常であれば、エラーにならないはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const availability = 99;
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());

        const result = await repository.updateOne(screeningDay, eventIdentifier, availability);
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Redisが正常でなければ、エラーが投げられるはず', async () => {
        const screeningDay = 'screeningDay';
        const eventIdentifier = 'eventIdentifier';
        const availability = 99;
        const redisError = new Error('manual error');
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('hset').once().callsArgWith(3, redisError);

        const result = await repository.updateOne(screeningDay, eventIdentifier, availability).catch((err) => err);
        assert.deepEqual(result, redisError);
        sandbox.verify();
    });
});

describe('removeByPerformaceDay()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('Redisの状態が正常であれば、エラーにならないはず', async () => {
        const screeningDay = 'screeningDay';
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());

        const result = await repository.removeByPerformaceDay(screeningDay);
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('Redisが正常でなければ、エラーが投げられるはず', async () => {
        const screeningDay = 'screeningDay';
        const redisError = new Error('manual error');
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('del').once().callsArgWith(1, redisError);

        const result = await repository.removeByPerformaceDay(screeningDay).catch((err) => err);
        assert.deepEqual(result, redisError);
        sandbox.verify();
    });
});

describe('setTTLIfNotExist()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('期限が未設定であれば、セットされるはず', async () => {
        const screeningDay = 'screeningDay';
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        sandbox.mock(repository.redisClient).expects('ttl').once().callsArgWith(1, null, -1);
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('expire').once().callsArgWith(2, null);

        const result = await repository.setTTLIfNotExist(screeningDay);
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('redisClient.ttlが正常でなければ、エラーが投げられるはず', async () => {
        const screeningDay = 'screeningDay';
        const redisError = new Error('manual error');
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('ttl').once().callsArgWith(1, redisError);
        sandbox.mock(repository.redisClient).expects('expire').never();

        const result = await repository.setTTLIfNotExist(screeningDay).catch((err) => err);
        assert.equal(result, redisError);
        sandbox.verify();
    });

    it('期限設定済であれば、セットしないはず', async () => {
        const screeningDay = 'screeningDay';
        const ttl = 10;
        const repository = new domain.repository.itemAvailability.ScreeningEvent(redis.createClient());
        // tslint:disable-next-line:no-magic-numbers
        sandbox.mock(repository.redisClient).expects('ttl').once().callsArgWith(1, null, ttl);
        sandbox.mock(repository.redisClient).expects('expire').never();

        const result = await repository.setTTLIfNotExist(screeningDay);
        assert.equal(result, undefined);
        sandbox.verify();
    });
});
