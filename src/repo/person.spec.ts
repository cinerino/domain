// tslint:disable:no-implicit-dependencies
/**
 * ユーザーリポジトリテスト
 */
import { } from 'mocha';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('管理者権限でユーザー属性を取得する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSが正常であればユーザー属性を取得できるはず', async () => {
        const data = {
            UserAttributes: []
        };

        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('adminGetUser')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.getUserAttributes({
            username: 'username'
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const awsError = new Error('awsError');

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('adminGetUser')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.getUserAttributes({
            username: 'username'
        })
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });
});

describe('IDでユーザーを検索する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('ユーザーが存在すればオブジェクトを取得できるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const data = {
            Users: [{
                Attributes: [
                    { Name: 'sub', Value: 'value' },
                    { Name: 'given_name', Value: '' },
                    { Name: 'family_name', Value: '' },
                    { Name: 'email', Value: '' },
                    { Name: 'phone_number', Value: '+819012345678' }
                ]
            }]
        };

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.findById({
            userId: 'userId'
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('ユーザーが存在しなければNotFoundエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const data = {
            Users: []
        };

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.findById({
            userId: 'userId'
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const awsError = new Error('awsError');

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.findById({
            userId: 'userId'
        })
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });
});

describe('アクセストークンでユーザー属性を取得する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('ユーザーが存在すればオブジェクトを取得できるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const data = {
            UserAttributes: [{ Name: 'sub', Value: 'value' }]
        };

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('getUser')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.getUserAttributesByAccessToken('accessToken');
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const awsError = new Error('awsError');

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('getUser')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.getUserAttributesByAccessToken('accessToken')
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });
});

describe('アクセストークンでユーザー属性を更新する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSが正常であれば成功するはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('updateUserAttributes')
            .once()
            .callsArgWith(1, null);

        const result = await personRepo.updateProfileByAccessToken({
            accessToken: '',
            profile: <any>{
                telephone: '+819012345678',
                additionalProperty: [
                    { name: 'custom', value: 'value' }
                ]
            }
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('AWSがエラーを返せばArgumentエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const awsError = new Error('awsError');

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('updateUserAttributes')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.updateProfileByAccessToken({
            accessToken: '',
            profile: <any>{
                telephone: '+819012345678'
            }
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });

    it('電話番号フォーマットが適切でなければArgumentエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('updateUserAttributes')
            .never();

        const result = await personRepo.updateProfileByAccessToken({
            accessToken: '',
            profile: <any>{
                telephone: '00000000000000000'
            }
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.Argument);
        sandbox.verify();
    });
});

describe('disable', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSがエラーを返せばエラーとなるはず', async () => {
        const args = {
            userId: 'userId'
        };
        const data = {
            Users: [{
                Username: 'Username'
            }]
        };
        const awsError = new Error('awsError');

        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);
        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('adminDisableUser')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.disable(args)
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });

    it('AWSが正常であれば成功するはず', async () => {
        const args = {
            userId: 'userId'
        };
        const data = {
            Users: [{
                Username: 'Username'
            }]
        };

        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);
        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('adminDisableUser')
            .once()
            .callsArgWith(1, null);

        const result = await personRepo.disable(args);
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('会員検索', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSがエラーを返せばエラーとなるはず', async () => {
        const args = {
            username: 'username',
            id: 'id',
            email: 'email',
            telephone: 'telephone',
            givenName: 'givenName',
            familyName: 'familyName'
        };
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });
        const awsError = new Error('awsError');

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.search(args)
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });

    it('AWSが正常であれば成功するはず', async () => {
        const args = {
            username: 'username'
        };
        const data = {
            Users: [{ Username: 'Username', Attributes: [{ Name: 'name', Value: 'value' }] }]
        };
        const personRepo = new domain.repository.Person({
            userPoolId: 'xxxxx'
        });

        sandbox.mock(personRepo.cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.search(args);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});
