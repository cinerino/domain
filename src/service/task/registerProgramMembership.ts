import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { orderProgramMembership } from '../transaction/orderProgramMembership';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.RegisterProgramMembership>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }

        const projectRepo = new ProjectRepo(settings.connection);
        const project = await projectRepo.findById({ id: data.project.id });
        if (project.settings === undefined
            || project.settings.gmo === undefined
            || project.settings.cognito === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const personRepo = new PersonRepo({
            userPoolId: project.settings.cognito.customerUserPool.id
        });

        switch (data.object?.typeOf) {
            // 旧メンバーシップ注文タスクへの互換性維持のため
            case 'Offer':
                const creditCardRepo = new CreditCardRepo({
                    siteId: project.settings.gmo.siteId,
                    sitePass: project.settings.gmo.sitePass,
                    cardService: new GMO.service.Card({ endpoint: project.settings.gmo.endpoint })
                });

                await orderProgramMembership(data)({
                    action: new ActionRepo(settings.connection),
                    confirmationNumber: new ConfirmationNumberRepo(settings.redisClient),
                    creditCard: creditCardRepo,
                    orderNumber: new OrderNumberRepo(settings.redisClient),
                    ownershipInfo: new OwnershipInfoRepo(settings.connection),
                    person: personRepo,
                    project: new ProjectRepo(settings.connection),
                    registerActionInProgress: new RegisterServiceInProgressRepo(settings.redisClient),
                    transaction: new TransactionRepo(settings.connection)
                });

                break;

            default:
                throw new factory.errors.Argument('Object', `Invalid object type: ${data.object?.typeOf}`);
        }
    };
}
