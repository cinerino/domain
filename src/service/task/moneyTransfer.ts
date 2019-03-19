import * as pecorino from '@pecorino/api-nodejs-client';
import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.MoneyTransfer>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.pecorinoEndpoint === undefined) {
            throw new Error('settings.pecorinoEndpoint undefined.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.pecorinoAuthClient === undefined) {
            throw new Error('settings.pecorinoAuthClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        const withdrawService = new pecorino.service.transaction.Withdraw({
            endpoint: settings.pecorinoEndpoint,
            auth: settings.pecorinoAuthClient
        });
        const transferService = new pecorino.service.transaction.Transfer({
            endpoint: settings.pecorinoEndpoint,
            auth: settings.pecorinoAuthClient
        });

        await PaymentService.account.settleTransaction(data)({
            action: actionRepo,
            withdrawService: withdrawService,
            transferService: transferService
        });
    };
}
