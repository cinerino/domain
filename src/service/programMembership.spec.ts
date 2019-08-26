// tslint:disable:no-implicit-dependencies
/**
 * 会員プログラムサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;
let redisClient: redis.RedisClient;

before(() => {
    sandbox = sinon.createSandbox();
    redisClient = redis.createClient();
});

describe('会員プログラム登録タスクを作成する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('リポジトリが正常であればタスクを作成できるはず', async () => {
        const programMembership = {
            offers: [{ price: 123 }]
        };
        const seller = { name: {} };
        const task = {};
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);
        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(programMembershipRepo)
            .expects('search')
            .once()
            .resolves([programMembership]);
        sandbox.mock(taskRepo)
            .expects('save')
            .once()
            .resolves(task);

        const result = await domain.service.programMembership.createRegisterTask(<any>{
            agent: {},
            seller: {}
        })({
            seller: sellerRepo,
            programMembership: programMembershipRepo,
            task: taskRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});

describe('会員プログラムに登録する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('すでに登録済であれば何もしないはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person();
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        const ownershipInfo = {
            typeOfGood: { id: 'programMembershipId' }
        };

        sandbox.mock(projectRepo)
            .expects('findById')
            .never();
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .once()
            .resolves([ownershipInfo]);
        sandbox.mock(actionRepo)
            .expects('start')
            .never();

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
                typeOf: 'Offer',
                itemOffered: {
                    id: 'programMembershipId',
                    offers: [],
                    hostingOrganization: {}
                }
            }
        })({
            action: actionRepo,
            creditCard: creditCardRepo,
            orderNumber: orderNumberRepo,
            seller: sellerRepo,
            ownershipInfo: ownershipInfoRepo,
            person: personRepo,
            programMembership: programMembershipRepo,
            project: projectRepo,
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });
});

describe('会員プログラム登録解除タスクを作成する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('リポジトリが正常であればタスクを作成できるはず', async () => {
        const ownershipInfo = {};
        const task = {};
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .once()
            .resolves([ownershipInfo]);
        sandbox.mock(taskRepo)
            .expects('save')
            .once()
            .resolves(task);

        const result = await domain.service.programMembership.createUnRegisterTask(<any>{
            agent: { memberOf: { membershipNumber: 'membershipNumber' } },
            ownershipInfoIdentifier: 'ownershipInfoIdentifier'
        })({
            ownershipInfo: ownershipInfoRepo,
            task: taskRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});

describe('会員プログラム登録解除', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('リポジトリが正常であればアクションを完了できるはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(taskRepo.taskModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves({});
        sandbox.mock(ownershipInfoRepo.ownershipInfoModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .resolves({});
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await domain.service.programMembership.unRegister(<any>{
            object: {
                typeOfGood: { id: 'programMembershipId' },
                ownedBy: { memberOf: { membershipNumber: 'membershipNumber' } }
            }
        })({
            action: actionRepo,
            ownershipInfo: ownershipInfoRepo,
            task: taskRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('リポジトリでエラーが発生すればアクションを断念するはず', async () => {
        const findTaskError = new Error('findTaskError');
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(taskRepo.taskModel)
            .expects('findOneAndUpdate')
            .once()
            .chain('exec')
            .rejects(findTaskError);
        sandbox.mock(actionRepo)
            .expects('complete')
            .never();
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});

        const result = await domain.service.programMembership.unRegister(<any>{
            object: {
                typeOfGood: { id: 'programMembershipId' },
                ownedBy: { memberOf: { membershipNumber: 'membershipNumber' } }
            }
        })({
            action: actionRepo,
            ownershipInfo: ownershipInfoRepo,
            task: taskRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, findTaskError);
        sandbox.verify();
    });
});
