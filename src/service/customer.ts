/**
 * 顧客サービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { CognitoRepository as PersonRepo } from '../repo/person';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as factory from '../factory';

/**
 * 会員削除
 */
export function deleteMember(params: factory.action.update.deleteAction.member.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        person: PersonRepo;
        task: TaskRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const customer = params.object;
            if (customer.memberOf === undefined) {
                throw new factory.errors.NotFound('params.agent.memberOf');
            }
            if (customer.memberOf.membershipNumber === undefined) {
                throw new factory.errors.NotFound('params.agent.memberOf.membershipNumber');
            }

            // Cognitoユーザを無効にする
            await repos.person.disable({
                username: customer.memberOf.membershipNumber
            });
            // await repos.person.deleteById({
            //     userId: customer.id
            // });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.update.deleteAction.member.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });

        await onMemberDeleted(params)(repos);
    };
}

/**
 * 会員削除後アクション
 */
export function onMemberDeleted(params: factory.action.update.deleteAction.member.IAttributes) {
    return async (repos: { task: TaskRepo }) => {
        const now = new Date();
        const potentialActions = params.potentialActions;
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            if (Array.isArray(potentialActions.unRegisterProgramMembership)) {
                taskAttributes.push(...potentialActions.unRegisterProgramMembership.map(
                    (a): factory.task.IAttributes<factory.taskName.UnRegisterProgramMembership> => {
                        return {
                            project: a.project,
                            name: factory.taskName.UnRegisterProgramMembership,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
