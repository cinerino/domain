/**
 * タスクサービス
 */
import * as createDebug from 'debug';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import { factory } from '../factory';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as NotificationService from './notification';
import { task2lineNotify } from './notification/factory';

const debug = createDebug('cinerino-domain:service');

const ABORTED_TASKS_WITHOUT_REPORT: string[] = (typeof process.env.ABORTED_TASKS_WITHOUT_REPORT === 'string')
    ? process.env.ABORTED_TASKS_WITHOUT_REPORT.split(',')
    : [];

export interface IConnectionSettings {
    /**
     * MongoDBコネクション
     */
    connection: mongoose.Connection;
    /**
     * Redisクライアント
     */
    redisClient?: redis.RedisClient;
}

export type TaskOperation<T> = (repos: { task: TaskRepo }) => Promise<T>;
export type IOperation<T> = (settings: IConnectionSettings) => Promise<T>;

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

/**
 * 実行中ステータスのままになっているタスクをリトライする
 */
export function retry(params: {
    project?: factory.project.IProject;
    intervalInMinutes: number;
}): TaskOperation<void> {
    return async (repos: { task: TaskRepo }) => {
        await repos.task.retry(params);
    };
}

/**
 * トライ可能回数が0に達したタスクを実行中止する
 */
export function abort(params: {
    project?: factory.project.IProject;
    /**
     * 最終トライ日時から何分経過したタスクを中止するか
     */
    intervalInMinutes: number;
}): TaskOperation<void> {
    return async (repos: { task: TaskRepo }) => {
        const abortedTask = await repos.task.abortOne(params);

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (abortedTask === null) {
            return;
        }
        debug('abortedTask found', abortedTask);

        // 中止を報告しないタスクであれば終了
        if (ABORTED_TASKS_WITHOUT_REPORT.includes(abortedTask.name)) {
            return;
        }

        // 開発者へ報告
        const message = task2lineNotify({ task: abortedTask });
        await NotificationService.report2developers(message.subject, message.content)();
    };
}
