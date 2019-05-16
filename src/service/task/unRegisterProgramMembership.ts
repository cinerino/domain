import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as ProgramMembershipService from '../programMembership';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.UnRegisterProgramMembership>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await ProgramMembershipService.unRegister(data)({
            action: new ActionRepo(settings.connection),
            ownershipInfo: new OwnershipInfoRepo(settings.connection),
            task: new TaskRepo(settings.connection)
        });

        // tslint:disable-next-line:no-suspicious-comment
        // TODO 会員退会は、本来会員プログラム解除とは別タスクにするべきなので、どこかで分離
        const personRepo = new PersonRepo();
        const customer = (<factory.person.IPerson>data.agent);
        if (customer.memberOf === undefined) {
            throw new factory.errors.NotFound('params.agent.memberOf');
        }
        if (customer.memberOf.membershipNumber === undefined) {
            throw new factory.errors.NotFound('params.agent.memberOf.membershipNumber');
        }

        // Cognitoユーザを無効にする
        await personRepo.unregister({
            userPooId: <string>process.env.COGNITO_USER_POOL_ID,
            username: customer.memberOf.membershipNumber
        });
    };
}
