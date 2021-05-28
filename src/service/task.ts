import { service } from '@chevre/domain';

/**
 * タスクサービス
 */
import * as createDebug from 'debug';

import { factory } from '../factory';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as chevre from '../chevre';

const debug = createDebug('cinerino-domain:service');

export type IConnectionSettings = service.task.IConnectionSettings & {
    chevreAuthClient?: chevre.auth.ClientCredentials;
};
export type IOperation<T> = (settings: IConnectionSettings) => Promise<T>;
// export type IOperation<T> = service.task.IOperation<T>;

/**
 * タスク名でタスクをひとつ実行する
 */
export function executeByName<T extends factory.taskName>(params: {
    project?: factory.project.IProject;
    name: T;
}): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const taskRepo = new TaskRepo(settings.connection);

        // 未実行のタスクを取得
        // tslint:disable-next-line:no-null-keyword
        let task: factory.task.ITask<T> | null = null;
        try {
            task = await taskRepo.executeOneByName(params);
        } catch (error) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            debug('executeByName error:', error);
        }

        // タスクがなければ終了
        if (task !== null) {
            await execute(task)(settings);
        }
    };
}

/**
 * タスクを実行する
 */
export function execute(task: factory.task.ITask<factory.taskName>): IOperation<void> {
    const now = new Date();

    return async (settings: IConnectionSettings) => {
        const taskRepo = new TaskRepo(settings.connection);

        try {
            // タスク名の関数が定義されていなければ、TypeErrorとなる
            const { call } = await import(`./task/${task.name}`);
            await call(task.data)(settings);
            const result = {
                executedAt: now,
                endDate: new Date(),
                error: ''
            };
            await taskRepo.pushExecutionResultById(task.id, factory.taskStatus.Executed, result);
        } catch (error) {
            debug('service.task.execute:', error);
            if (typeof error !== 'object') {
                error = { message: String(error) };
            }

            // 実行結果追加
            const result = {
                executedAt: now,
                endDate: new Date(),
                error: {
                    ...error,
                    code: error.code,
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                }
            };
            // 失敗してもここではステータスを戻さない(Runningのまま待機)
            await taskRepo.pushExecutionResultById(task.id, task.status, result);
        }
    };
}

export import retry = service.task.retry;
export import abort = service.task.abort;
