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

import { getCreditCardPaymentServiceChannel } from '../payment/chevre';
import { orderProgramMembership } from '../transaction/orderProgramMembership';

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
        const project = await projectRepo.findById({ id: data.project.id });
        if (project.settings?.cognito === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const paymentServiceCredentials = await getCreditCardPaymentServiceChannel({
            project: { id: data.project.id },
            paymentMethodType: factory.paymentMethodType.CreditCard
        });

        const creditCardRepo = new CreditCardRepo({
            siteId: paymentServiceCredentials.siteId,
            sitePass: paymentServiceCredentials.sitePass,
            cardService: new GMO.service.Card({ endpoint: paymentServiceCredentials.endpoint })
        });

        const personRepo = new PersonRepo({
            userPoolId: project.settings.cognito.customerUserPool.id
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
    };
}
