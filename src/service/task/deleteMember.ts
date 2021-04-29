import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as CustomerService from '../customer';
import { getCreditCardPaymentServiceChannel } from '../payment/chevre';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.DeleteMember>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const chevreAuthClient = new chevre.auth.ClientCredentials({
            domain: credentials.chevre.authorizeServerDomain,
            clientId: credentials.chevre.clientId,
            clientSecret: credentials.chevre.clientSecret,
            scopes: [],
            state: ''
        });

        const projectService = new chevre.service.Project({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const project = await projectService.findById({ id: data.project.id });
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

        await CustomerService.deleteMember(data)({
            action: new ActionRepo(settings.connection),
            creditCard: creditCardRepo,
            person: personRepo,
            project: projectService,
            task: new TaskRepo(settings.connection)
        });
    };
}
