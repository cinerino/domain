import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as TaskRepo } from '../../repo/task';

import * as CustomerService from '../customer';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.DeleteMember>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        await CustomerService.deleteMember(data)({
            action: new ActionRepo(settings.connection),
            person: new PersonRepo(),
            task: new TaskRepo(settings.connection)
        });
    };
}
