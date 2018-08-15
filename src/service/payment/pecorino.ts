/**
 * ポイント決済サービス
 */
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';

const debug = createDebug('cinerino-domain:*');

/**
 * ポイント支払実行
 */
export function payPoint(params: factory.task.payPoint.IData) {
    return async (repos: {
        action: ActionRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const pecorinoTransaction = params.object.pointTransaction;
            switch (pecorinoTransaction.typeOf) {
                case pecorinoapi.factory.transactionType.Withdraw:
                    // 支払取引の場合、確定
                    const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                        endpoint: params.object.pointAPIEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    await withdrawService.confirm({
                        transactionId: pecorinoTransaction.id
                    });
                    break;

                case pecorinoapi.factory.transactionType.Transfer:
                    // 転送取引の場合確定
                    const transferTransactionService = new pecorinoapi.service.transaction.Transfer({
                        endpoint: params.object.pointAPIEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    await transferTransactionService.confirm({
                        transactionId: pecorinoTransaction.id
                    });
                    break;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
                    throw new factory.errors.NotImplemented(
                        `transaction type '${(<any>pecorinoTransaction).typeOf}' not implemented.`
                    );
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.Point> = {};
        await repos.action.complete(action.typeOf, action.id, actionResult);
    };
}

/**
 * Pecorinoオーソリ取消
 * @param transactionId 取引ID
 */
export function cancelPointAuth(transactionId: string) {
    return async (repos: {
        action: ActionRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        // Pecorino承認アクションを取得
        const authorizeActions = <factory.action.authorize.paymentMethod.point.IAction[]>await repos.action.findAuthorizeByTransactionId(
            transactionId
        ).then((actions) => actions
            .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.point.ObjectType.PointPayment)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        );

        await Promise.all(authorizeActions.map(async (action) => {
            // 承認アクション結果は基本的に必ずあるはず
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (action.result === undefined) {
                throw new factory.errors.NotFound('action.result');
            }

            switch (action.result.pointTransaction.typeOf) {
                case pecorinoapi.factory.transactionType.Withdraw:
                    // 支払取引の場合、中止
                    const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                        endpoint: action.result.pointAPIEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    await withdrawService.cancel({
                        transactionId: action.result.pointTransaction.id
                    });
                    break;

                case pecorinoapi.factory.transactionType.Transfer:
                    // 転送取引の場合、中止
                    const transferTransactionService = new pecorinoapi.service.transaction.Transfer({
                        endpoint: action.result.pointAPIEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    await transferTransactionService.cancel({
                        transactionId: action.result.pointTransaction.id
                    });
                    break;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
                    throw new factory.errors.NotImplemented(
                        `transaction type '${(<any>action.result.pointTransaction).typeOf}' not implemented.`
                    );
            }
        }));
    };
}

/**
 * ポイント口座返金処理を実行する
 */
export function refundPoint(params: factory.task.refundPoint.IData) {
    return async (repos: {
        action: ActionRepo;
        task: TaskRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        const action = await repos.action.start(params);

        try {
            // 返金アクション属性から、Pecorino取引属性を取り出す
            const payActionAttributes = params.object;
            const pecorinoTransaction = payActionAttributes.object.pointTransaction;
            const pecorinoEndpoint = payActionAttributes.object.pointAPIEndpoint;
            const notes = 'シネマサンシャイン 返金';

            switch (pecorinoTransaction.typeOf) {
                case factory.pecorino.transactionType.Withdraw:
                    // Pecorino入金取引で返金実行
                    const depositService = new pecorinoapi.service.transaction.Deposit({
                        endpoint: pecorinoEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    const depositTransaction = await depositService.start({
                        accountType: factory.accountType.Point,
                        toAccountNumber: pecorinoTransaction.object.fromAccountNumber,
                        // tslint:disable-next-line:no-magic-numbers
                        expires: moment().add(5, 'minutes').toDate(),
                        agent: pecorinoTransaction.recipient,
                        recipient: pecorinoTransaction.agent,
                        amount: pecorinoTransaction.object.amount,
                        notes: notes
                    });
                    await depositService.confirm({ transactionId: depositTransaction.id });

                    break;

                case factory.pecorino.transactionType.Transfer:
                    // 口座振込の場合、逆の振込取引実行
                    const transferService = new pecorinoapi.service.transaction.Transfer({
                        endpoint: pecorinoEndpoint,
                        auth: repos.pecorinoAuthClient
                    });
                    const transferTransaction = await transferService.start({
                        accountType: factory.accountType.Point,
                        toAccountNumber: pecorinoTransaction.object.fromAccountNumber,
                        fromAccountNumber: pecorinoTransaction.object.toAccountNumber,
                        // tslint:disable-next-line:no-magic-numbers
                        expires: moment().add(5, 'minutes').toDate(),
                        agent: pecorinoTransaction.recipient,
                        recipient: pecorinoTransaction.agent,
                        amount: pecorinoTransaction.object.amount,
                        notes: notes
                    });
                    await transferService.confirm({ transactionId: transferTransaction.id });

                    break;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
                    throw new factory.errors.NotImplemented(
                        `transaction type '${(<any>pecorinoTransaction).typeOf}' not implemented.`
                    );

            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete(action.typeOf, action.id, {});

        // 潜在アクション
        await onRefund(params)({ task: repos.task });
    };
}

/**
 * 返金後のアクション
 * @param refundActionAttributes 返金アクション属性
 */
function onRefund(refundActionAttributes: factory.action.trade.refund.IAttributes<factory.paymentMethodType>) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = refundActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes[] = [];
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendEmailMessage !== undefined) {
                const sendEmailMessageTask: factory.task.sendEmailMessage.IAttributes = {
                    name: factory.taskName.SendEmailMessage,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 3,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        actionAttributes: potentialActions.sendEmailMessage
                    }
                };
                taskAttributes.push(sendEmailMessageTask);
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
