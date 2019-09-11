// tslint:disable:no-implicit-dependencies
/**
 * 会員プログラムサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
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
