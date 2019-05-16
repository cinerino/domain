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

    // tslint:disable-next-line:max-func-body-length
    it('リポジトリが正常であれば登録できて、ポイントを追加できるはず', async () => {
        const creditCard = { cardSeq: 'cardSeq' };
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

        const fakeOwnershipInfo = [{
            typeOfGood: { accountNumber: '123' }
        }];
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };
        const project = {
            id: 'id',
            settings: {
                pecorino: {}
            }
        };

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .twice()
            .resolves(fakeOwnershipInfo)
            .onFirstCall()
            .resolves([]);
        sandbox.mock(actionRepo)
            .expects('start')
            .twice()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('lock')
            .once()
            .resolves(1);
        sandbox.mock(actionRepo)
            .expects('complete')
            .twice()
            .resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('start')
            .once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .once()
            .resolves([creditCard]);
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.payment.creditCard)
            .expects('authorize')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(personRepo)
            .expects('getUserAttributes')
            .once()
            .resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('updateCustomerProfile')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('confirm')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype)
            .expects('start')
            .once()
            .resolves({});

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
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

    it('ポイントを追加する時、所有権が見つけなかったら、エラーとなるはず', async () => {
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

        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };
        const project = {
            id: 'id',
            settings: {
                pecorino: {}
            }
        };

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .twice()
            .resolves([]);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('lock')
            .once()
            .resolves(1);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('unlock')
            .once()
            .resolves();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('start')
            .once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create')
            .never();
        sandbox.mock(domain.service.payment.creditCard)
            .expects('authorize')
            .never();
        sandbox.mock(personRepo)
            .expects('getUserAttributes')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('updateCustomerProfile')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('confirm')
            .never();
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype)
            .expects('start')
            .never();

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
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
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    // tslint:disable-next-line:max-func-body-length
    it('ポイントを追加する時、エラーが発生すればエラーとなるはず', async () => {
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

        const fakeOwnershipInfo = [{
            typeOfGood: { accountNumber: '123' }
        }];
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };
        const project = {
            id: 'id',
            settings: {
                pecorino: {}
            }
        };

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .twice()
            .resolves(fakeOwnershipInfo)
            .onFirstCall()
            .resolves([]);
        sandbox.mock(actionRepo)
            .expects('start')
            .twice()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('lock')
            .once()
            .resolves(1);
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .twice()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('unlock')
            .once()
            .resolves();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('start')
            .once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create')
            .never();
        sandbox.mock(domain.service.payment.creditCard)
            .expects('authorize')
            .never();
        sandbox.mock(personRepo)
            .expects('getUserAttributes')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('updateCustomerProfile')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('confirm')
            .never();
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype)
            .expects('start')
            .once()
            .rejects('fake error');

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
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
        })
            .catch((err) => err);
        assert.equal(result, 'fake error');
        sandbox.verify();
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

    // tslint:disable-next-line:max-func-body-length
    it('クレジットカードが見つからなければアクションを断念するはず', async () => {
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

        const fakeOwnershipInfo = [{
            typeOfGood: { accountNumber: '123' }
        }];
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };
        const project = {
            id: 'id',
            settings: {
                pecorino: {}
            }
        };

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .twice()
            .resolves(fakeOwnershipInfo)
            .onFirstCall()
            .resolves([]);
        sandbox.mock(actionRepo)
            .expects('start')
            .twice()
            .resolves({});
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('lock')
            .once()
            .resolves(1);
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('start')
            .once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .once()
            .resolves([]);
        sandbox.mock(registerActionInProgressRepoRepo)
            .expects('unlock')
            .once()
            .resolves(1);
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});
        sandbox.mock(actionRepo)
            .expects('giveUp')
            .once()
            .resolves({});
        sandbox.mock(domain.pecorinoapi.service.transaction.Deposit.prototype)
            .expects('start')
            .once()
            .resolves({});

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
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
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
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
