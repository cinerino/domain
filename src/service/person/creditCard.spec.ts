// tslint:disable:no-implicit-dependencies
/**
 * 会員クレジットカードサービステスト
 */
import * as GMO from '@motionpicture/gmo-service';
import * as assert from 'power-assert';
import * as sinon from 'sinon';

import { errors } from '../../factory';
import * as PersonCreditCardService from './creditCard';

const gmoErrorMemberNotFound = { errors: [{ info: 'E01390002' }] };
let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('PersonCreditCardService.save()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('GMOが正常であれば、オブジェクトを取得できるはず', async () => {
        const personId = 'personId';
        const creditCard = {};
        const gmoMember = {};
        const saveCardResult = {};
        const addedCreditCard = {};
        const searchCardResults = [addedCreditCard];

        sandbox.mock(GMO.services.card).expects('searchMember').once().resolves(gmoMember);
        sandbox.mock(GMO.services.card).expects('saveMember').never();
        sandbox.mock(GMO.services.card).expects('saveCard').once().resolves(saveCardResult);
        sandbox.mock(GMO.services.card).expects('searchCard').once().resolves(searchCardResults);

        const result = await PersonCreditCardService.save(personId, <any>creditCard)();
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('会員未登録であれば、登録してから、オブジェクトを取得できるはず', async () => {
        const personId = 'personId';
        const creditCard = {};
        const searchMemberError = gmoErrorMemberNotFound;
        const saveMemberResult = {};
        const saveCardResult = {};
        const addedCreditCard = {};
        const searchCardResults = [addedCreditCard];

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().resolves(saveMemberResult);
        sandbox.mock(GMO.services.card).expects('saveCard').once().resolves(saveCardResult);
        sandbox.mock(GMO.services.card).expects('searchCard').once().resolves(searchCardResults);

        const result = await PersonCreditCardService.save(personId, <any>creditCard)();
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('会員検索時にエラーが発生すればそのままArgumentエラーになるはず', async () => {
        const personId = 'personId';
        const creditCard = {};
        const searchMemberError = {
            name: 'GMOServiceBadRequestError',
            errors: [{ content: 'content' }]
        };

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().never();
        sandbox.mock(GMO.services.card).expects('saveCard').once().never();
        sandbox.mock(GMO.services.card).expects('searchCard').once().never();

        const result = await PersonCreditCardService.save(personId, <any>creditCard)().catch((err) => err);
        assert(result instanceof errors.Argument);
        sandbox.verify();
    });

    it('GMOServiceBadRequestErrorが投げられれば、Argumentエラーになるはず', async () => {
        const personId = 'personId';
        const creditCard = {};
        const searchMemberError = gmoErrorMemberNotFound;
        const saveMemberResult = {};
        const saveCardResult = {
            name: 'GMOServiceBadRequestError',
            errors: [{ content: 'content' }]
        };

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().resolves(saveMemberResult);
        sandbox.mock(GMO.services.card).expects('saveCard').once().rejects(saveCardResult);
        sandbox.mock(GMO.services.card).expects('searchCard').never();

        const result = await PersonCreditCardService.save(personId, <any>creditCard)().catch((err) => err);
        assert(result instanceof errors.Argument);
        sandbox.verify();
    });

    it('GMOが何かしらエラーを投げれば、そのままエラーになるはず', async () => {
        const personId = 'personId';
        const creditCard = {};
        const searchMemberError = gmoErrorMemberNotFound;
        const saveMemberResult = {};
        const saveCardResult = new Error('GMOError');

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().resolves(saveMemberResult);
        sandbox.mock(GMO.services.card).expects('saveCard').once().rejects(saveCardResult);
        sandbox.mock(GMO.services.card).expects('searchCard').never();

        const result = await PersonCreditCardService.save(personId, <any>creditCard)().catch((err) => err);
        assert(result instanceof Error);
        assert.deepStrictEqual(result, saveCardResult);
        sandbox.verify();
    });
});

describe('PersonCreditCardService.unsubscribe()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('GMOが正常であれば、voidを返すはず', async () => {
        const personId = 'personId';
        const cardSeq = 'cardSeq';
        const deleteCardResult = {};

        sandbox.mock(GMO.services.card).expects('deleteCard').once().resolves(deleteCardResult);

        const result = await PersonCreditCardService.unsubscribe(personId, cardSeq)();
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('GMOServiceBadRequestErrorが投げられれば、Argumentエラーになるはず', async () => {
        const personId = 'personId';
        const cardSeq = 'cardSeq';
        const deleteCardResult = {
            name: 'GMOServiceBadRequestError',
            errors: [{ content: 'content' }]
        };

        sandbox.mock(GMO.services.card).expects('deleteCard').once().rejects(deleteCardResult);

        const result = await PersonCreditCardService.unsubscribe(personId, cardSeq)().catch((err) => err);
        assert(result instanceof errors.Argument);
        sandbox.verify();
    });

    it('GMOが何かしらエラーを投げれば、そのままエラーになるはず', async () => {
        const personId = 'personId';
        const cardSeq = 'cardSeq';
        const deleteCardResult = new Error('GMOError');

        sandbox.mock(GMO.services.card).expects('deleteCard').once().rejects(deleteCardResult);

        const result = await PersonCreditCardService.unsubscribe(personId, cardSeq)().catch((err) => err);
        assert(result instanceof Error);
        assert.deepStrictEqual(result, deleteCardResult);
        sandbox.verify();
    });
});

describe('PersonCreditCardService.find()', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('GMOが正常であれば、配列を返すはず', async () => {
        const personId = 'personId';
        const gmoMember = {};
        const searchCardResults = [{ deleteFlag: '0' }, { deleteFlag: '1' }];

        sandbox.mock(GMO.services.card).expects('searchMember').once().resolves(gmoMember);
        sandbox.mock(GMO.services.card).expects('saveMember').never();
        sandbox.mock(GMO.services.card).expects('searchCard').once().resolves(searchCardResults);

        const result = await PersonCreditCardService.find(personId)();
        assert(Array.isArray(result));
        sandbox.verify();
    });

    it('会員未登録であれば、登録してから、配列を返すはず', async () => {
        const personId = 'personId';
        const searchMemberError = gmoErrorMemberNotFound;
        const saveMemberResult = {};
        const searchCardResults = [{ deleteFlag: '0' }, { deleteFlag: '1' }];

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().resolves(saveMemberResult);
        sandbox.mock(GMO.services.card).expects('searchCard').once().resolves(searchCardResults);

        const result = await PersonCreditCardService.find(personId)();
        assert(Array.isArray(result));
        sandbox.verify();
    });

    it('会員検索時にエラーが発生すればそのままArgumentエラーになるはず', async () => {
        const personId = 'personId';
        const searchMemberError = {
            name: 'GMOServiceBadRequestError',
            errors: [{ content: 'content' }]
        };

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().never();
        sandbox.mock(GMO.services.card).expects('searchCard').once().never();

        const result = await PersonCreditCardService.find(personId)().catch((err) => err);
        assert(result instanceof errors.Argument);
        sandbox.verify();
    });

    it('GMOが何かしらエラーを投げれば、そのままエラーになるはず', async () => {
        const personId = 'personId';
        const searchMemberError = new Error('GMOError');

        sandbox.mock(GMO.services.card).expects('searchMember').once().rejects(searchMemberError);
        sandbox.mock(GMO.services.card).expects('saveMember').once().never();
        sandbox.mock(GMO.services.card).expects('searchCard').once().never();

        const result = await PersonCreditCardService.find(personId)().catch((err) => err);
        assert(result instanceof Error);
        assert.deepStrictEqual(result, searchMemberError);
        sandbox.verify();
    });
});
