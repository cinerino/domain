/**
 * プロダクトサービス
 */
import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as factory from '../factory';

import { handleChevreError } from '../errorHandler';

import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

/**
 * サービス登録
 */
export function registerService(params: factory.action.interact.register.service.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // アクション開始
        const registerActionAttributes = params;
        const action = await repos.action.start(registerActionAttributes);

        try {
            const object = registerActionAttributes.object;

            // 座席予約確定
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.chevre === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            const registerServiceTransaction = new chevre.service.transaction.RegisterService({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            await registerServiceTransaction.confirm(object);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handleChevreError(error);

            throw error;
        }

        // アクション完了
        const result: factory.action.interact.register.service.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        await onRegistered(registerActionAttributes)(repos);
    };
}

export function onRegistered(
    actionAttributes: factory.action.interact.register.service.IAttributes
) {
    return async (repos: { task: TaskRepo }) => {
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // 次のメンバーシップ注文タスクを作成
        const orderProgramMembershipTasks = actionAttributes.potentialActions?.orderProgramMembership;
        if (Array.isArray(orderProgramMembershipTasks)) {
            taskAttributes.push(...orderProgramMembershipTasks);
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
