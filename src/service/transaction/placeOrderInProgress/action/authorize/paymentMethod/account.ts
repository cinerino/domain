/**
 * 口座決済承認アクションサービス
 */
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OrganizationRepo } from '../../../../../../repo/organization';
import { MongoRepository as OwnershipInfoRepo } from '../../../../../../repo/ownershipInfo';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import { handlePecorinoError } from '../../../../../../errorHandler';

const debug = createDebug('cinerino-domain:*');

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    organization: OrganizationRepo;
    ownershipInfo: OwnershipInfoRepo;
    transaction: TransactionRepo;
    withdrawTransactionService?: pecorinoapi.service.transaction.Withdraw;
    transferTransactionService?: pecorinoapi.service.transaction.Transfer;
}) => Promise<T>;

/**
 * 口座残高差し押さえ
 * 口座取引は、出金取引あるいは転送取引のどちらかを選択できます。
 */
export function create<T extends factory.accountType>(params: {
    /**
     * 取引ID
     */
    transactionId: string;
    /**
     * 金額
     */
    amount: number;
    /**
     * 確保口座
     */
    fromAccount: {
        /**
         * 口座タイプ
         */
        accountType: T;
        /**
         * 口座番号
         */
        accountNumber: string;
    };
    /**
     * 取引メモ
     */
    notes?: string;
}): ICreateOperation<factory.action.authorize.paymentMethod.account.IAction<T>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        organization: OrganizationRepo;
        ownershipInfo: OwnershipInfoRepo;
        transaction: TransactionRepo;
        /**
         * 出金取引サービス
         */
        withdrawTransactionService?: pecorinoapi.service.transaction.Withdraw;
        /**
         * 転送取引サービス
         */
        transferTransactionService?: pecorinoapi.service.transaction.Transfer;
    }) => {
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // インセンティブ付与可能条件は、会員プログラム特典に加入しているかどうか
        if (transaction.agent.memberOf === undefined) {
            throw new factory.errors.Forbidden('Membership required');
        }
        // const programMemberships = await repos.ownershipInfo.search({
        //     goodType: 'ProgramMembership',
        //     ownedBy: transaction.agent.id,
        //     ownedAt: new Date()
        // });
        // const pecorinoPaymentAward = programMemberships.reduce((a, b) => [...a, ...b.typeOfGood.award], [])
        //     .find((a) => a === factory.programMembership.Award.xxxx);
        // if (pecorinoPaymentAward === undefined) {
        //     throw new factory.errors.Forbidden('Membership program required');
        // }

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.account.IAttributes<T> = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment,
                amount: params.amount,
                accountType: params.fromAccount.accountType,
                fromAccountNumber: params.fromAccount.accountNumber
            },
            agent: transaction.agent,
            recipient: transaction.seller,
            purpose: transaction
        };
        const action = await repos.action.start(actionAttributes);

        // Pecorino取引開始
        let pendingTransaction: factory.action.authorize.paymentMethod.account.IPendingTransaction<T>;
        try {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else *//* istanbul ignore next */
            if (repos.withdrawTransactionService !== undefined) {
                debug('starting pecorino pay transaction...', params.amount);
                pendingTransaction = await repos.withdrawTransactionService.start({
                    // 最大1ヵ月のオーソリ
                    expires: moment().add(1, 'month').toDate(),
                    agent: {
                        typeOf: transaction.agent.typeOf,
                        id: transaction.agent.id,
                        name: `placeOrderTransaction-${transaction.id}`,
                        url: transaction.agent.url
                    },
                    recipient: {
                        typeOf: transaction.seller.typeOf,
                        id: transaction.seller.id,
                        name: transaction.seller.name.ja,
                        url: transaction.seller.url
                    },
                    amount: params.amount,
                    notes: (params.notes !== undefined) ? params.notes : 'Cinerino PlaceOrderTransaction',
                    accountType: params.fromAccount.accountType,
                    fromAccountNumber: params.fromAccount.accountNumber
                });
                debug('pecorinoTransaction started.', pendingTransaction.id);
            } else if (repos.transferTransactionService !== undefined) {
                // 組織から転送先口座IDを取得する
                const seller = await repos.organization.findById(transaction.seller.typeOf, transaction.seller.id);
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if */
                if (seller.paymentAccepted === undefined) {
                    throw new factory.errors.Argument('transactionId', 'Pecorino payment not accepted.');
                }
                const accountPaymentsAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.Account>[]>
                    seller.paymentAccepted.filter((a) => a.paymentMethodType === factory.paymentMethodType.Account);
                const paymentAccepted = accountPaymentsAccepted.find((a) => a.accountType === params.fromAccount.accountType);
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if */
                if (paymentAccepted === undefined) {
                    throw new factory.errors.Argument('transactionId', `${params.fromAccount.accountType} payment not accepted`);
                }

                debug('starting pecorino pay transaction...', params.amount);
                pendingTransaction = await repos.transferTransactionService.start({
                    // 最大1ヵ月のオーソリ
                    expires: moment().add(1, 'month').toDate(),
                    agent: {
                        typeOf: transaction.agent.typeOf,
                        id: transaction.agent.id,
                        name: `placeOrderTransaction-${transaction.id}`,
                        url: transaction.agent.url
                    },
                    recipient: {
                        typeOf: transaction.seller.typeOf,
                        id: transaction.seller.id,
                        name: transaction.seller.name.ja,
                        url: transaction.seller.url
                    },
                    amount: params.amount,
                    // tslint:disable-next-line:no-single-line-block-comment
                    notes: (params.notes !== undefined) ? /* istanbul ignore next */ params.notes : 'Cinerino PlaceOrderTransaction',
                    accountType: params.fromAccount.accountType,
                    fromAccountNumber: params.fromAccount.accountNumber,
                    toAccountNumber: paymentAccepted.accountNumber
                });
                debug('pecorinoTransaction started.', pendingTransaction.id);
            } else {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                throw new factory.errors.Argument('repos', 'withdrawTransactionService or transferTransactionService required.');
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ name: error.name, message: error.message } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            // PecorinoAPIのエラーｗｐハンドリング
            error = handlePecorinoError(error);
            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const actionResult: factory.action.authorize.paymentMethod.account.IResult<T> = {
            amount: params.amount,
            pendingTransaction: pendingTransaction
        };

        return repos.action.complete(action.typeOf, action.id, actionResult);
    };
}

/**
 * 口座承認を取り消す
 */
export function cancel(params: {
    /**
     * 取引進行者ID
     */
    agentId: string;
    /**
     * 取引ID
     */
    transactionId: string;
    /**
     * 承認アクションID
     */
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        withdrawTransactionService?: pecorinoapi.service.transaction.Withdraw;
        transferTransactionService?: pecorinoapi.service.transaction.Transfer;
    }) => {
        debug('canceling pecorino authorize action...');
        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // まずアクションをキャンセル
        const action = await repos.action.cancel(factory.actionType.AuthorizeAction, params.actionId);
        const actionResult = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>action.result;

        // Pecorinoで取消中止実行
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else *//* istanbul ignore next */
        if (repos.withdrawTransactionService !== undefined) {
            await repos.withdrawTransactionService.cancel({
                transactionId: actionResult.pendingTransaction.id
            });
        } else if (repos.transferTransactionService !== undefined) {
            await repos.transferTransactionService.cancel({
                transactionId: actionResult.pendingTransaction.id
            });
        } else {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            throw new factory.errors.Argument('resos', 'withdrawTransactionService or transferTransactionService required.');
        }
    };
}
