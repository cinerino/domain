/**
 * 口座決済サービス
 */
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';

const debug = createDebug('cinerino-domain:service');

/**
 * 口座支払実行
 */
export function payAccount(params: factory.task.payAccount.IData) {
    return async (repos: {
        action: ActionRepo;
        withdrawService: pecorinoapi.service.transaction.Withdraw;
        transferService: pecorinoapi.service.transaction.Transfer;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);
        try {
            const pendingTransaction = params.object.pendingTransaction;
            switch (pendingTransaction.typeOf) {
                case pecorinoapi.factory.transactionType.Withdraw:
                    // 支払取引の場合、確定
                    await repos.withdrawService.confirm({
                        transactionId: pendingTransaction.id
                    });
                    break;

                case pecorinoapi.factory.transactionType.Transfer:
                    // 転送取引の場合確定
                    await repos.transferService.confirm({
                        transactionId: pendingTransaction.id
                    });
                    break;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
                    throw new factory.errors.NotImplemented(
                        `Transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
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
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.Account> = {};
        await repos.action.complete(action.typeOf, action.id, actionResult);
    };
}

/**
 * Pecorinoオーソリ取消
 * @param transactionId 取引ID
 */
export function cancelAccountAuth(params: { transactionId: string }) {
    return async (repos: {
        action: ActionRepo;
        withdrawService: pecorinoapi.service.transaction.Withdraw;
        transferService: pecorinoapi.service.transaction.Transfer;
    }) => {
        // 口座承認アクションを取得
        const authorizeActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
            await repos.action.findAuthorizeByTransactionId(params).then((actions) => actions
                .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment)
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            );
        await Promise.all(authorizeActions.map(async (action) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                switch (action.result.pendingTransaction.typeOf) {
                    case pecorinoapi.factory.transactionType.Withdraw:
                        await repos.withdrawService.cancel({
                            transactionId: action.result.pendingTransaction.id
                        });
                        break;

                    case pecorinoapi.factory.transactionType.Transfer:
                        await repos.transferService.cancel({
                            transactionId: action.result.pendingTransaction.id
                        });
                        break;

                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    default:
                        throw new factory.errors.NotImplemented(
                            `transaction type '${(<any>action.result.pendingTransaction).typeOf}' not implemented.`
                        );
                }
            }
        }));
    };
}

/**
 * 口座返金処理を実行する
 */
export function refundAccount(params: factory.task.refundAccount.IData) {
    return async (repos: {
        action: ActionRepo;
        task: TaskRepo;
        depositService: pecorinoapi.service.transaction.Deposit;
        transferService: pecorinoapi.service.transaction.Transfer;
    }) => {
        const action = await repos.action.start(params);

        try {
            // 返金アクション属性から、Pecorino取引属性を取り出す
            const payActionAttributes = params.object;
            const pendingTransaction = payActionAttributes.object.pendingTransaction;
            const notes = 'Cinerino 返金';

            switch (pendingTransaction.typeOf) {
                case factory.pecorino.transactionType.Withdraw:
                    const depositTransaction = await repos.depositService.start({
                        accountType: pendingTransaction.object.accountType,
                        toAccountNumber: pendingTransaction.object.fromAccountNumber,
                        // tslint:disable-next-line:no-magic-numbers
                        expires: moment().add(5, 'minutes').toDate(),
                        agent: pendingTransaction.recipient,
                        recipient: pendingTransaction.agent,
                        amount: pendingTransaction.object.amount,
                        notes: notes
                    });
                    await repos.depositService.confirm({ transactionId: depositTransaction.id });

                    break;

                case factory.pecorino.transactionType.Transfer:
                    const transferTransaction = await repos.transferService.start({
                        accountType: pendingTransaction.object.accountType,
                        toAccountNumber: pendingTransaction.object.fromAccountNumber,
                        fromAccountNumber: pendingTransaction.object.toAccountNumber,
                        // tslint:disable-next-line:no-magic-numbers
                        expires: moment().add(5, 'minutes').toDate(),
                        agent: pendingTransaction.recipient,
                        recipient: pendingTransaction.agent,
                        amount: pendingTransaction.object.amount,
                        notes: notes
                    });
                    await repos.transferService.confirm({ transactionId: transferTransaction.id });

                    break;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
                    throw new factory.errors.NotImplemented(
                        `transaction type '${(<any>pendingTransaction).typeOf}' not implemented.`
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
