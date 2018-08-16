/**
 * 口座サービス
 * 口座の保管先はPecorinoサービスです。
 */
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';
// import * as createDebug from 'debug';

import { handlePecorinoError } from '../errorHandler';
import { RedisRepository as AccountNumberRepo } from '../repo/accountNumber';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

// const debug = createDebug('cinerino-domain:*');

type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.AccountGoodType.Account>>;
type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.ownershipInfo.AccountGoodType.Account>>;
type IAccountsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    accountService: pecorinoapi.service.Account;
}) => Promise<T>;

/**
 * 口座開設
 */
export function open<T extends factory.accountType>(params: {
    agent: factory.ownershipInfo.IOwner;
    name: string;
    accountType: T;
}) {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        /**
         * 口座番号リポジトリー
         */
        accountNumber: AccountNumberRepo;
        /**
         * Pecorino口座サービス
         */
        accountService: pecorinoapi.service.Account;
    }) => {
        const now = new Date();
        let ownershipInfoWithDetail: IOwnershipInfoWithDetail;
        try {
            // 口座番号を発行
            const accountNumber = await repos.accountNumber.publish(new Date());
            const account = await repos.accountService.open({
                accountType: params.accountType,
                accountNumber: accountNumber,
                name: params.name
            });
            const ownershipInfo: IOwnershipInfo = {
                typeOf: 'OwnershipInfo',
                // 十分にユニーク
                // tslint:disable-next-line:max-line-length
                identifier: `${factory.ownershipInfo.AccountGoodType.Account}-${account.accountType}-${account.accountNumber}`,
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: account.accountType,
                    accountNumber: account.accountNumber
                },
                ownedBy: params.agent,
                ownedFrom: now,
                // tslint:disable-next-line:no-magic-numbers
                ownedThrough: moment(now).add(100, 'years').toDate() // 十分に無期限
            };
            await repos.ownershipInfo.save(ownershipInfo);
            ownershipInfoWithDetail = { ...ownershipInfo, typeOfGood: account };
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return ownershipInfoWithDetail;
    };
}

/**
 * 口座解約
 */
export function close<T extends factory.accountType>(params: {
    personId: string;
    accountType: T;
    accountNumber: string;
}): IAccountsOperation<void> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        try {
            const accountOwnershipInfos = await repos.ownershipInfo.search({
                goodType: factory.ownershipInfo.AccountGoodType.Account,
                ownedBy: params.personId
            });
            const ownershipInfo = accountOwnershipInfos
                .filter((o) => o.typeOfGood.accountType === params.accountType)
                .find((o) => o.typeOfGood.accountNumber === params.accountNumber);
            if (ownershipInfo === undefined) {
                throw new factory.errors.NotFound('Account');
            }
            await repos.accountService.close({
                accountType: ownershipInfo.typeOfGood.accountType,
                accountNumber: ownershipInfo.typeOfGood.accountNumber
            });
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }
    };
}

/**
 * 口座検索
 */
export function search<T extends factory.accountType>(params: {
    personId: string;
    accountType: T;
    accountNumber: string;
    ownedAt: Date;
}): IAccountsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 口座所有権を検索
            let ownershipInfos = await repos.ownershipInfo.search({
                goodType: factory.ownershipInfo.AccountGoodType.Account,
                ownedBy: params.personId,
                ownedAt: params.ownedAt
            });
            ownershipInfos = ownershipInfos.filter((o) => o.typeOfGood.accountType === params.accountType);
            const accountNumbers = ownershipInfos.map((o) => o.typeOfGood.accountNumber);
            if (accountNumbers.length > 0) {
                const accounts = await repos.accountService.search({
                    accountType: params.accountType,
                    accountNumbers: accountNumbers,
                    statuses: [],
                    limit: 100
                });
                ownershipInfosWithDetail = ownershipInfos.map((o) => {
                    const account = accounts.find((a) => a.accountNumber === o.typeOfGood.accountNumber);
                    if (account === undefined) {
                        throw new factory.errors.NotFound('Account');
                    }

                    return { ...o, typeOfGood: account };
                });
            }
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return ownershipInfosWithDetail;
    };
}

/**
 * 口座取引履歴検索
 */
export function searchMoneyTransferActions<T extends factory.accountType>(params: {
    personId: string;
    accountType: T;
    accountNumber: string;
    ownedAt: Date;
}): IAccountsOperation<factory.pecorino.action.transfer.moneyTransfer.IAction<T>[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        let actions: factory.pecorino.action.transfer.moneyTransfer.IAction<T>[] = [];
        try {
            const ownershipInfos = await repos.ownershipInfo.search({
                goodType: factory.ownershipInfo.AccountGoodType.Account,
                ownedBy: params.personId,
                ownedAt: params.ownedAt
            });
            const ownershipInfo = ownershipInfos
                .filter((o) => o.typeOfGood.accountType === params.accountType)
                .find((o) => o.typeOfGood.accountNumber === params.accountNumber);
            if (ownershipInfo === undefined) {
                throw new factory.errors.NotFound('Account');
            }
            actions = await repos.accountService.searchMoneyTransferActions({
                accountType: ownershipInfo.typeOfGood.accountType,
                accountNumber: ownershipInfo.typeOfGood.accountNumber
            });
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return actions;
    };
}

/**
 * 入金処理を実行する
 */
// export function deposit(params: {
//     agent: {
//         id: string;
//         name: string;
//         url: string;
//     };
//     recipient: {
//         id: string;
//         name: string;
//         url: string;
//     };
//     /**
//      * 入金先口座番号
//      */
//     toAccountNumber: string;
//     /**
//      * 入金金額
//      */
//     amount: number;
//     /**
//      * 入金説明
//      */
//     notes: string;
// }) {
//     return async (repos: {
//         /**
//          * Pecorino入金サービス
//          */
//         depositService: pecorinoapi.service.transaction.Deposit;
//     }) => {
//         try {
//             const transaction = await repos.depositService.start({
//                 accountType: factory.accountType.Point,
//                 toAccountNumber: params.toAccountNumber,
//                 expires: moment().add(1, 'minutes').toDate(),
//                 agent: {
//                     typeOf: factory.personType.Person,
//                     id: params.agent.id,
//                     name: params.agent.name,
//                     url: params.agent.url
//                 },
//                 recipient: {
//                     typeOf: factory.personType.Person,
//                     id: params.recipient.id,
//                     name: params.recipient.name,
//                     url: params.recipient.url
//                 },
//                 amount: params.amount,
//                 notes: params.notes
//             });
//             await repos.depositService.confirm({ transactionId: transaction.id });
//         } catch (error) {
//             error = handlePecorinoError(error);
//             throw error;
//         }
//     };
// }
