// tslint:disable:no-implicit-dependencies
/**
 * メンバーシップオファー承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as redis from 'redis-mock';
import * as sinon from 'sinon';
import * as domain from '../../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

const project = { id: 'id', settings: { chevre: { endpoint: '' } } };

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('メンバーシップオファー承認', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であればアクションを完了できるはず', async () => {
        const acceptedOffer = {
            identifier: 'identifier',
            itemOffered: { membershipFor: { id: 'membershipForId' } },
            priceSpecification: {
                typeOf: domain.factory.chevre.priceSpecificationType.CompoundPriceSpecification,
                priceComponent: []
            }
        };
        const transaction = { project: {}, id: 'transactionId', agent: { id: 'agentId' }, seller: { name: {} } };
        const membershipService = { project: project, serviceOutput: { typeOf: 'outputType' } };

        const actionRepo = new domain.repository.Action(mongoose.connection);
        const ownershipInfoRepo = new domain.repository.OwnershipInfo(mongoose.connection);
        const projectRepo = new domain.repository.Project(mongoose.connection);
        const registerActionInProgressRepo = new domain.repository.action.RegisterProgramMembershipInProgress(redis.createClient());
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);

        sandbox.mock(projectRepo)
            .expects('findById')
            .once()
            .resolves(project);
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(domain.chevre.service.Product.prototype)
            .expects('findById')
            .once()
            .resolves(membershipService);
        sandbox.mock(domain.chevre.service.Product.prototype)
            .expects('searchOffers')
            .once()
            .resolves([acceptedOffer]);

        sandbox.mock(domain.chevre.service.TransactionNumber.prototype)
            .expects('publish')
            .once()
            .resolves({ transactionNumber: 'transactionNumber' });

        sandbox.mock(ownershipInfoRepo)
            .expects('search')
            .once()
            .resolves([]);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});

        sandbox.mock(registerActionInProgressRepo)
            .expects('lock')
            .once()
            .resolves(1);

        sandbox.mock(domain.chevre.service.transaction.RegisterService.prototype)
            .expects('start')
            .once()
            .resolves({});

        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await domain.service.offer.programMembership.authorize({
            project: <any>project,
            agent: { id: transaction.agent.id },
            object: <any>acceptedOffer,
            purpose: <any>{ id: transaction.id }
        })({
            action: actionRepo,
            ownershipInfo: ownershipInfoRepo,
            project: projectRepo,
            registerActionInProgressRepo: registerActionInProgressRepo,
            transaction: transactionRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});
