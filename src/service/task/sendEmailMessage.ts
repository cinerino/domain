import { IConnectionSettings, IOperation } from '../task';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

import * as NotificationService from '../notification';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.SendEmailMessage>): IOperation<void> {
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
            auth: chevreAuthClient,
            project: { id: '' }
        });

        await NotificationService.sendEmailMessage(data.actionAttributes)({
            action: new ActionRepo(settings.connection),
            project: projectService
        });
    };
}
