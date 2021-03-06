/**
 * カスタマーサービス
 */
import { MongoRepository as ActionRepo } from '../repo/action';
import { GMORepository as CreditCardRepo } from '../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../repo/person';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as factory from '../factory';

/**
 * 会員削除
 */
export function deleteMember(params: factory.action.update.deleteAction.member.IAttributes & {
    physically?: boolean;
}) {
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        person: PersonRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // アクション開始
        const action = await repos.action.start(params);

        try {
            const customer = params.object;

            if (params.physically === true) {
                await repos.person.deleteById({
                    userId: customer.id
                });
            } else {
                // Cognitoユーザを無効にする
                await repos.person.disable({
                    userId: customer.id
                });
            }

            // 全クレジットカード削除
            let gmoMemberId = customer.id;
            const useUsernameAsGMOMemberId = project.settings?.useUsernameAsGMOMemberId === true;
            if (useUsernameAsGMOMemberId) {
                if (typeof customer.memberOf?.membershipNumber === 'string') {
                    gmoMemberId = customer.memberOf.membershipNumber;
                }
            }

            const creditCards = await repos.creditCard.search({ personId: gmoMemberId });
            await Promise.all(creditCards.map(async (creditCard) => {
                await repos.creditCard.deleteBySequenceNumber({ personId: gmoMemberId, cardSeq: creditCard.cardSeq });
            }));
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

export function findCreditCard(params: {
    project: { id: string };
    customer: { id: string };
}) {
    return async (repos: {
        creditCard: CreditCardRepo;
        person: PersonRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        const customer = await repos.person.findById({ userId: params.customer.id });

        // 会員クレジットカード検索
        const useUsernameAsGMOMemberId = project.settings?.useUsernameAsGMOMemberId === true;
        const gmoMemberId = (useUsernameAsGMOMemberId) ? String(customer.memberOf?.membershipNumber) : customer.id;
        const creditCards = await repos.creditCard.search({ personId: gmoMemberId });
        // creditCards = creditCards.filter((c) => c.defaultFlag === '1');
        const creditCard = creditCards.shift();
        if (creditCard === undefined) {
            throw new factory.errors.NotFound('CreditCard');
        }

        return {
            ...creditCard,
            memberId: gmoMemberId
        };
    };
}
