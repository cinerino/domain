// tslint:disable:no-implicit-dependencies
/**
 * ユーザーリポジトリテスト
 */
import * as AWS from 'aws-sdk';
import { } from 'mocha';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;
let cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

before(() => {
    sandbox = sinon.createSandbox();
    cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider(<any>{});
});

describe('管理者権限でユーザー属性を取得する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSが正常であればユーザー属性を取得できるはず', async () => {
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const data = {
            UserAttributes: []
        };
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('adminGetUser')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.getUserAttributes({
            userPooId: 'userPooId',
            username: 'username'
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('adminGetUser')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.getUserAttributes({
            userPooId: 'userPooId',
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
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
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
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.findById({
            userPooId: 'userPooId',
            userId: 'userId'
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('ユーザーが存在しなければNotFoundエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const data = {
            Users: []
        };
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.findById({
            userPooId: 'userPooId',
            userId: 'userId'
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.findById({
            userPooId: 'userPooId',
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
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const data = {
            UserAttributes: [{ Name: 'sub', Value: 'value' }]
        };
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('getUser')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.getUserAttributesByAccessToken('accessToken');
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });

    it('AWSが正常でなければそのままエラーとなるはず', async () => {
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
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
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        sandbox.mock(cognitoIdentityServiceProvider)
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
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
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
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        sandbox.mock(cognitoIdentityServiceProvider)
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

describe('unregister', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('AWSがエラーを返せばエラーとなるはず', async () => {
        const args = {
            userPooId: 'userPoolId',
            username: 'username'
        };
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('adminDisableUser')
            .once()
            .callsArgWith(1, awsError);

        const result = await personRepo.unregister(args)
            .catch((err) => err);
        assert.deepEqual(result, awsError);
        sandbox.verify();
    });

    it('AWSが正常であれば成功するはず', async () => {
        const args = {
            userPooId: 'userPoolId',
            username: 'username'
        };
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('adminDisableUser')
            .once()
            .callsArgWith(1, null);

        const result = await personRepo.unregister(args);
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
            userPooId: 'userPoolId',
            username: 'username',
            id: 'id',
            email: 'email',
            telephone: 'telephone',
            givenName: 'givenName',
            familyName: 'familyName'
        };
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const awsError = new Error('awsError');
        sandbox.mock(cognitoIdentityServiceProvider)
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
            userPooId: 'userPoolId',
            username: 'username'
        };
        const data = {
            Users: [{ Username: 'Username', Attributes: [{ Name: 'name', Value: 'value' }] }]
        };
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        sandbox.mock(cognitoIdentityServiceProvider)
            .expects('listUsers')
            .once()
            .callsArgWith(1, null, data);

        const result = await personRepo.search(args);
        assert(Array.isArray(result));
        sandbox.verify();
    });
});
