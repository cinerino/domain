/**
 * タスクサービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as AWS from 'aws-sdk';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import * as factory from '../factory';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as NotificationService from './notification';

const debug = createDebug('cinerino-domain:service');

export interface IConnectionSettings {
    /**
     * MongoDBコネクション
     */
    connection: mongoose.Connection;
    /**
     * Redisクライアント
     */
    redisClient?: redis.RedisClient;
    /**
     * PecorinoAPIエンドポイント
     */
    pecorinoEndpoint?: string;
    /**
     * PecorinoAPI認証クライアント
     */
    pecorinoAuthClient?: pecorinoapi.auth.ClientCredentials;
    /**
     * Cognitoサービスプロバイダー
     */
    cognitoIdentityServiceProvider?: AWS.CognitoIdentityServiceProvider;
}

export interface ISettings extends IConnectionSettings {
    /**
     * タスクリポジトリ
     */
    taskRepo: TaskRepo;
}

export type TaskOperation<T> = (repos: { task: TaskRepo }) => Promise<T>;
export type IExecuteOperation<T> = (settings: ISettings) => Promise<T>;
export type IOperation<T> = (settings: IConnectionSettings) => Promise<T>;

export const ABORT_REPORT_SUBJECT = 'Task aborted !!!';

/**
 * タスク名でタスクをひとつ実行する
 */
export function executeByName<T extends factory.taskName>(params: {
    project?: factory.project.IProject;
    name: T;
}): IExecuteOperation<void> {
    return async (settings: ISettings) => {
        // 未実行のタスクを取得
        let task: factory.task.ITask<T> | null = null;
        try {
            task = await settings.taskRepo.executeOneByName(params);
            debug('task found', task);
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
export function execute(task: factory.task.ITask<factory.taskName>): IExecuteOperation<void> {
    debug('executing a task...', task);
    const now = new Date();

    return async (settings: ISettings) => {
        try {
            // タスク名の関数が定義されていなければ、TypeErrorとなる
            const { call } = await import(`./task/${task.name}`);
            await call(task.data)(settings);
            const result = {
                executedAt: now,
                error: ''
            };
            await settings.taskRepo.pushExecutionResultById(task.id, factory.taskStatus.Executed, result);
        } catch (error) {
            // 実行結果追加
            const result = {
                executedAt: now,
                error: error.stack
            };
            // 失敗してもここではステータスを戻さない(Runningのまま待機)
            await settings.taskRepo.pushExecutionResultById(task.id, task.status, result);
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

        // 開発者へ報告
        const lastResult = (abortedTask.executionResults.length > 0) ?
            abortedTask.executionResults[abortedTask.executionResults.length - 1].error :
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            '';

        await NotificationService.report2developers(
            ABORT_REPORT_SUBJECT,
            `project:${(params.project !== undefined) ? params.project.id : ''}
id:${abortedTask.id}
name:${abortedTask.name}
runsAt:${moment(abortedTask.runsAt)
                .toISOString()}
lastTriedAt:${moment(<Date>abortedTask.lastTriedAt)
                .toISOString()}
numberOfTried:${abortedTask.numberOfTried}
lastResult:${lastResult}`
        )();
    };
}
