// tslint:disable:no-implicit-dependencies
/**
 * プロダクトサービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');
import * as domain from '../index';

const project = { id: 'id', settings: { chevre: { endpoint: '' } } };

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('プロダクト注文タスクを作成する', () => {
    beforeEach(() => {
        sandbox.restore();
    });

    it('リポジトリが正常であればタスクを作成できるはず', async () => {
        const offers = [{ id: 'offerId', identifier: 'identifier' }];
        const membershipService = { project: project, serviceOutput: { typeOf: 'ProgramMembership' } };
        const seller = {
            project: { id: '' },
            name: {}
        };
        const task = {};

        const sellerRepo = new domain.repository.Seller(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const taskRepo = new domain.repository.Task(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(sellerRepo)
            .expects('findById')
            .once()
            .resolves(seller);
        sandbox.mock(taskRepo)
            .expects('save')
            .once()
            .resolves(task);
        sandbox.mock(domain.chevre.service.Product.prototype)
            .expects('findById')
            .once()
            .resolves(membershipService);
        sandbox.mock(domain.chevre.service.Product.prototype)
            .expects('searchOffers')
            .once()
            .resolves(offers);

        const result = await domain.service.product.createOrderTask({
            project: project,
            agent: <any>{},
            object: {
                typeOf: domain.factory.chevre.offerType.Offer,
                id: offers[0].id,
                itemOffered: { id: 'productId' },
                seller: { typeOf: domain.factory.organizationType.MovieTheater, id: 'sellerId' }
            }
        })({
            seller: sellerRepo,
            project: projectRepo,
            task: taskRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});