/**
 * 口座サービス
 * 口座の保管先はPecorinoサービスです。
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';
import * as util from 'util';

import * as factory from '../factory';

import { handlePecorinoError } from '../errorHandler';
import { RedisRepository as AccountNumberRepo } from '../repo/accountNumber';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';

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

            // 口座開設
            const account = await repos.accountService.open({
                accountType: params.accountType,
                accountNumber: accountNumber,
                name: params.name
            });

            // 所有権発行
            const identifier = util.format(
                '%s-%s-%s-%s',
                params.agent.id,
                factory.pecorino.account.TypeOf.Account,
                account.accountType,
                account.accountNumber
            );
            const ownershipInfo: IOwnershipInfo = {
                typeOf: 'OwnershipInfo',
                id: '',
                identifier: identifier,
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: account.accountType,
                    accountNumber: account.accountNumber
                },
                ownedBy: params.agent,
                ownedFrom: now,
                ownedThrough: moment(now)
                    // tslint:disable-next-line:no-magic-numbers
                    .add(100, 'years')
                    .toDate() // 十分に無期限
            };

            // Cinemasunshine対応
            if (process.env.OWNERSHIP_INFO_UUID_DISABLED === '1') {
                await repos.ownershipInfo.saveByIdentifier(ownershipInfo);
            } else {
                await repos.ownershipInfo.save(ownershipInfo);
            }

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
    ownedBy: {
        id: string;
    };
    accountType: T;
    accountNumber: string;
}): IAccountsOperation<void> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        try {
            const accountOwnershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>({
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: params.accountType,
                    accountNumbers: [params.accountNumber]
                },
                ownedBy: params.ownedBy
            });
            const ownershipInfo = accountOwnershipInfos[0];
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
export function search(
    params: factory.ownershipInfo.ISearchConditions<factory.ownershipInfo.AccountGoodType.Account>
): IAccountsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 口座所有権を検索
            const ownershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>(params);
            const accountNumbers = ownershipInfos.map((o) => o.typeOfGood.accountNumber);
            const typeOfGood =
                (<factory.ownershipInfo.ITypeOfGoodSearchConditions<factory.ownershipInfo.AccountGoodType.Account>>params.typeOfGood);

            if (accountNumbers.length > 0) {
                const accounts = await repos.accountService.search({
                    accountType: typeOfGood.accountType,
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
export function searchMoneyTransferActions<T extends factory.accountType>(
    params: {
        ownedBy: {
            id: string;
        };
        ownedFrom?: Date;
        ownedThrough?: Date;
        conditions: pecorinoapi.factory.action.transfer.moneyTransfer.ISearchConditions<T>;
    }
): IAccountsOperation<factory.pecorino.action.transfer.moneyTransfer.IAction<T>[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        accountService: pecorinoapi.service.Account;
    }) => {
        let actions: factory.pecorino.action.transfer.moneyTransfer.IAction<T>[] = [];
        try {
            const ownershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>({
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: params.conditions.accountType,
                    accountNumbers: [params.conditions.accountNumber]
                },
                ownedBy: params.ownedBy,
                ownedFrom: params.ownedFrom,
                ownedThrough: params.ownedThrough
            });
            const ownershipInfo = ownershipInfos[0];
            if (ownershipInfo === undefined) {
                throw new factory.errors.NotFound('Account');
            }
            actions = await repos.accountService.searchMoneyTransferActions(params.conditions);
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return actions;
    };
}

/**
 * 所有権なしにポイント口座を開設する
 */
export function openWithoutOwnershipInfo<T extends factory.accountType>(params: {
    name: string;
    accountType: T;
}) {
    return async (repos: {
        /**
         * 口座番号リポジトリ
         */
        accountNumber: AccountNumberRepo;
        /**
         * Pecorino口座サービス
         */
        accountService: pecorinoapi.service.Account;
    }) => {
        // 口座番号を発行
        const accountNumber = await repos.accountNumber.publish(new Date());

        let account: factory.pecorino.account.IAccount<T>;
        try {
            account = await repos.accountService.open({
                accountType: params.accountType,
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
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
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
