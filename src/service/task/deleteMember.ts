import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as CustomerService from '../customer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.DeleteMember>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const projectRepo = new ProjectRepo(settings.connection);
        const projectId = data.project.id;
        const project = await projectRepo.findById({ id: projectId });
        if (project.settings === undefined
            || project.settings.cognito === undefined
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

        await CustomerService.deleteMember(data)({
            action: new ActionRepo(settings.connection),
            creditCard: creditCardRepo,
            person: personRepo,
            task: new TaskRepo(settings.connection)
        });
    };
}
