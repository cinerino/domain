import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProgramMembershipRepo } from '../../repo/programMembership';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ProgramMembershipService from '../programMembership';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.OrderProgramMembership>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const projectRepo = new ProjectRepo(settings.connection);
        const projectId = data.project.id;
        const project = await projectRepo.findById({ id: projectId });
        if (project.settings === undefined
            || project.settings.gmo === undefined
            || project.settings.cognito === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const creditCardRepo = new CreditCardRepo({
            siteId: project.settings.gmo.siteId,
            sitePass: project.settings.gmo.sitePass,
            cardService: new GMO.service.Card({ endpoint: project.settings.gmo.endpoint })
        });

        const personRepo = new PersonRepo({
            userPoolId: project.settings.cognito.customerUserPool.id
        });

        await ProgramMembershipService.orderProgramMembership(data)({
            action: new ActionRepo(settings.connection),
            creditCard: creditCardRepo,
            orderNumber: new OrderNumberRepo(settings.redisClient),
            seller: new SellerRepo(settings.connection),
            ownershipInfo: new OwnershipInfoRepo(settings.connection),
            person: personRepo,
            programMembership: new ProgramMembershipRepo(settings.connection),
            project: new ProjectRepo(settings.connection),
            registerActionInProgressRepo: new RegisterProgramMembershipInProgressRepo(settings.redisClient),
            transaction: new TransactionRepo(settings.connection)
        });
    };
}