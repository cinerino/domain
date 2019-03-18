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
let cognitoIdentityServiceProvider: domain.AWS.CognitoIdentityServiceProvider;

before(() => {
    sandbox = sinon.createSandbox();
    redisClient = redis.createClient();
    cognitoIdentityServiceProvider = new domain.AWS.CognitoIdentityServiceProvider();
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

    it('リポジトリが正常であれば登録できるはず', async () => {
        const creditCard = { cardSeq: 'cardSeq' };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .once()
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
            .expects('complete')
            .once()
            .resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('start')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .once()
            .resolves([creditCard]);
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard)
            .expects('create')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(personRepo)
            .expects('getUserAttributes')
            .once()
            .resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('setCustomerContact')
            .once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress)
            .expects('confirm')
            .once()
            .returns(async () => Promise.resolve({}));

        const result = await domain.service.programMembership.register(<any>{
            agent: {
                memberOf: { membershipNumber: 'membershipNumber' }
            },
            object: {
                itemOffered: {
                    id: 'programMembershipId',
                    offers: [{ price: 123 }],
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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('リポジトリが正常であれば登録できて、ポイントを追加できるはず', async () => {
        const creditCard = { cardSeq: 'cardSeq' };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const depositService = new domain.pecorinoapi.service.transaction.Deposit(<any>{});
        const fakeOwnershipInfo = [{
            typeOfGood: { accountNumber: '123' }
        }];
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };

        sandbox.mock(ownershipInfoRepo).expects('search').twice().resolves(fakeOwnershipInfo).onFirstCall().resolves([]);
        sandbox.mock(actionRepo).expects('start').twice().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('lock').once().resolves(1);
        sandbox.mock(actionRepo).expects('complete').twice().resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('start').once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .once()
            .resolves([creditCard]);
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create').once().returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard)
            .expects('create').once().returns(async () => Promise.resolve({}));
        sandbox.mock(personRepo).expects('getUserAttributes').once().resolves({});
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('setCustomerContact').once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('confirm').once()
            .returns(async () => Promise.resolve({}));
        sandbox.mock(depositService).expects('start').once().resolves({});

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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo,
            depositService: depositService
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('ポイントを追加する時、所有権が見つけなかったら、エラーとなるはず', async () => {
        // const creditCard = { cardSeq: 'cardSeq' };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const depositService = new domain.pecorinoapi.service.transaction.Deposit(<any>{});
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };

        sandbox.mock(ownershipInfoRepo).expects('search').twice().resolves([]);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('lock').once().resolves(1);
        sandbox.mock(actionRepo).expects('giveUp').once().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('unlock').once().resolves();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('start').once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard)
            .expects('create').never();
        sandbox.mock(personRepo).expects('getUserAttributes').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('setCustomerContact').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('confirm').never();
        sandbox.mock(depositService).expects('start').never();

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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo,
            depositService: depositService
        })
            .catch((err) => err);
        assert(result instanceof domain.factory.errors.NotFound);
        sandbox.verify();
    });

    it('ポイントを追加する時、エラーが発生すればエラーとなるはず', async () => {
        // const creditCard = { cardSeq: 'cardSeq' };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        const depositService = new domain.pecorinoapi.service.transaction.Deposit(<any>{});
        const fakeOwnershipInfo = [{
            typeOfGood: { accountNumber: '123' }
        }];
        const fakeTransaction = {
            seller: { name: {} },
            agent: {}
        };

        sandbox.mock(ownershipInfoRepo).expects('search').twice().resolves(fakeOwnershipInfo).onFirstCall().resolves([]);
        sandbox.mock(actionRepo).expects('start').twice().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('lock').once().resolves(1);
        sandbox.mock(actionRepo).expects('giveUp').twice().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('unlock').once().resolves();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('start').once()
            .returns(async () => Promise.resolve(fakeTransaction));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard)
            .expects('create').never();
        sandbox.mock(personRepo).expects('getUserAttributes').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('setCustomerContact').never();
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('confirm').never();
        sandbox.mock(depositService).expects('start').once().rejects('fake error');

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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo,
            depositService: depositService
        })
            .catch((err) => err);
        assert.equal(result, 'fake error');
        sandbox.verify();
    });

    it('すでに登録済であれば何もしないはず', async () => {
        const ownershipInfo = {
            typeOfGood: { id: 'programMembershipId' }
        };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(ownershipInfoRepo).expects('search').once().resolves([ownershipInfo]);
        sandbox.mock(actionRepo).expects('start').never();

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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo
        });
        assert.equal(result, undefined);
        sandbox.verify();
    });

    it('注文プロセスでエラーが発生すればアクションを断念するはず', async () => {
        const startPlaceOrderError = new Error('startPlaceOrderError');
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(ownershipInfoRepo).expects('search').once().resolves([]);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('lock').once().resolves(1);
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('start').once()
            .returns(async () => Promise.reject(startPlaceOrderError));
        sandbox.mock(registerActionInProgressRepoRepo).expects('unlock').once().resolves();
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves({});

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
            registerActionInProgressRepo: registerActionInProgressRepoRepo,
            transaction: transactionRepo
        })
            .catch((err) => err);
        assert.deepEqual(result, startPlaceOrderError);
        sandbox.verify();
    });

    it('クレジットカードが見つからなければアクションを断念するはず', async () => {
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const creditCardRepo = new domain.repository.paymentMethod.CreditCard(<any>{});
        const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const personRepo = new domain.repository.Person(cognitoIdentityServiceProvider);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const registerActionInProgressRepoRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redisClient);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(ownershipInfoRepo).expects('search').once().resolves([]);
        sandbox.mock(actionRepo).expects('start').once().resolves({});
        sandbox.mock(registerActionInProgressRepoRepo).expects('lock').once().resolves(1);
        sandbox.mock(domain.service.transaction.placeOrderInProgress).expects('start').once().returns(async () => Promise.resolve({}));
        sandbox.mock(domain.service.transaction.placeOrderInProgress.action.authorize.offer.programMembership)
            .expects('create').once().returns(async () => Promise.resolve({}));
        sandbox.mock(creditCardRepo)
            .expects('search')
            .once()
            .resolves([]);
        sandbox.mock(registerActionInProgressRepoRepo).expects('unlock').once().resolves(1);
        sandbox.mock(actionRepo).expects('complete').never();
        sandbox.mock(actionRepo).expects('giveUp').once().resolves({});

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
