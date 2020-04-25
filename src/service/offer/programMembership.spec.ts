// tslint:disable:no-implicit-dependencies
/**
 * 会員プログラムオファー承認サービステスト
 */
import * as mongoose from 'mongoose';
import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as domain from '../../index';
// tslint:disable-next-line:no-require-imports no-var-requires
require('sinon-mongoose');

let sandbox: sinon.SinonSandbox;

before(() => {
    sandbox = sinon.createSandbox();
});

describe('会員プログラムオファーを承認する', () => {
    afterEach(() => {
        sandbox.restore();
    });

    it('MongoDBが正常であればアクションを完了できるはず', async () => {
        const acceptedOffer = {
            identifier: 'identifier',
            itemOffered: { id: 'programMembershipId' }
        };
        const transaction = { project: {}, id: 'transactionId', agent: { id: 'agentId' }, seller: { name: {} } };
        const programMembership = {
            offers: [{ identifier: 'identifier', priceSpecification: { price: 123 } }]
        };
        const actionRepo = new domain.repository.Action(mongoose.connection);
        const programMembershipRepo = new domain.repository.ProgramMembership(mongoose.connection);
        const transactionRepo = new domain.repository.Transaction(mongoose.connection);
        sandbox.mock(transactionRepo)
            .expects('findInProgressById')
            .once()
            .resolves(transaction);
        sandbox.mock(programMembershipRepo)
            .expects('search')
            .once()
            .resolves([programMembership]);
        sandbox.mock(actionRepo)
            .expects('start')
            .once()
            .resolves({});
        sandbox.mock(actionRepo)
            .expects('complete')
            .once()
            .resolves({});

        const result = await domain.service.offer.programMembership.authorize(<any>{
            agent: { id: transaction.agent.id },
            object: acceptedOffer,
            purpose: { id: transaction.id }
        })({
            action: actionRepo,
            programMembership: programMembershipRepo,
            transaction: transactionRepo
        });
        assert.equal(typeof result, 'object');
        sandbox.verify();
    });
});
