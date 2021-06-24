import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as CustomerService from '../customer';
import { getCreditCardPaymentServiceChannel } from '../payment/chevre';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.DeleteMember>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const projectRepo = new ProjectRepo(settings.connection);

        const project = await projectRepo.findById({ id: data.project.id });
        if (project.settings?.cognito === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const chevreAuthClient = settings.chevreAuthClient;
        if (chevreAuthClient === undefined) {
            throw new Error('settings.chevreAuthClient undefined');
        }

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: data.project.id }
        });

        const paymentServiceCredentials = await getCreditCardPaymentServiceChannel({
            project: { id: data.project.id },
            paymentMethodType: factory.paymentMethodType.CreditCard
        })({ product: productService });

        const creditCardRepo = new CreditCardRepo({
            siteId: paymentServiceCredentials.siteId,
            sitePass: paymentServiceCredentials.sitePass,
            cardService: new GMO.service.Card(
                { endpoint: paymentServiceCredentials.endpoint },
                { timeout: credentials.gmo.timeout }
            )
        });

        const personRepo = new PersonRepo({
            userPoolId: project.settings.cognito.customerUserPool.id
        });

        await CustomerService.deleteMember(data)({
            action: new ActionRepo(settings.connection),
            creditCard: creditCardRepo,
            person: personRepo,
            project: projectRepo,
            task: new TaskRepo(settings.connection)
        });
    };
}
