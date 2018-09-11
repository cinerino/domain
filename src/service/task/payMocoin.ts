import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';

import * as PaymentService from '../payment';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.PayMocoin>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.mocoinAuthClient === undefined) {
            throw new Error('settings.mocoinAuthClient undefined.');
        }

        const actionRepo = new ActionRepo(settings.connection);
        await PaymentService.mocoin.payMocoin(data)({
            action: actionRepo,
            mocoinAuthClient: settings.mocoinAuthClient
        });
    };
}
