/**
 * ポイント口座サービス
 * 口座の保管先はPecorinoサービスです。
 */
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
// import * as createDebug from 'debug';
import * as moment from 'moment';

import { handlePecorinoError } from '../errorHandler';
import { RedisRepository as AccountNumberRepo } from '../repo/accountNumber';

// const debug = createDebug('cinerino-domain:*');

/**
 * ポイント口座を開設する
 */
export function open(params: {
    name: string;
}) {
    return async (repos: {
        /**
         * 口座番号リポジトリー
         */
        accountNumber: AccountNumberRepo;
        /**
         * Pecorino口座サービス
         */
        accountService: pecorinoapi.service.Account;
    }) => {
        // 口座番号を発行
        const accountNumber = await repos.accountNumber.publish(new Date());

        let account: factory.pecorino.account.IAccount<factory.accountType.Point>;
        try {
            account = await repos.accountService.open({
                accountType: factory.accountType.Point,
                accountNumber: accountNumber,
                name: params.name
            });
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return account;
    };
}

/**
 * 入金処理を実行する
 */
export function deposit(params: {
    agent: {
        id: string;
        name: string;
        url: string;
    };
    recipient: {
        id: string;
        name: string;
        url: string;
    };
    /**
     * 入金先口座番号
     */
    toAccountNumber: string;
    /**
     * 入金金額
     */
    amount: number;
    /**
     * 入金説明
     */
    notes: string;
}) {
    return async (repos: {
        /**
         * Pecorino入金サービス
         */
        depositService: pecorinoapi.service.transaction.Deposit;
    }) => {
        try {
            const transaction = await repos.depositService.start({
                accountType: factory.accountType.Point,
                toAccountNumber: params.toAccountNumber,
                expires: moment().add(1, 'minutes').toDate(),
                agent: {
                    typeOf: factory.personType.Person,
                    id: params.agent.id,
                    name: params.agent.name,
                    url: params.agent.url
                },
                recipient: {
                    typeOf: factory.personType.Person,
                    id: params.recipient.id,
                    name: params.recipient.name,
                    url: params.recipient.url
                },
                amount: params.amount,
                notes: params.notes
            });
            await repos.depositService.confirm({ transactionId: transaction.id });
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }
    };
}
