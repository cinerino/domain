/**
 * 口座サービス
 * 口座の保管先はPecorinoサービスです。
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';
import * as util from 'util';

import { credentials } from '../credentials';

import * as factory from '../factory';

import { handlePecorinoError } from '../errorHandler';
import { RedisRepository as AccountNumberRepo } from '../repo/accountNumber';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';

type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.AccountGoodType.Account>>;
type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.ownershipInfo.AccountGoodType.Account>>;
type IAccountsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    project: ProjectRepo;
}) => Promise<T>;

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
    scopes: [],
    state: ''
});

/**
 * 口座開設
 */
export function open<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    agent: factory.ownershipInfo.IOwner;
    name: string;
    accountType: T;
}) {
    return async (repos: {
        /**
         * 口座番号リポジトリ
         */
        accountNumber: AccountNumberRepo;
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        let ownershipInfoWithDetail: IOwnershipInfoWithDetail;
        try {
            // 口座番号を発行
            const accountNumber = await repos.accountNumber.publish(new Date());

            // 口座開設
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }
            const accountService = new pecorinoapi.service.Account({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            const account = await accountService.open({
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

            await repos.ownershipInfo.save(ownershipInfo);

            ownershipInfoWithDetail = { ...ownershipInfo, typeOfGood: account };
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return ownershipInfoWithDetail;
    };
}

export interface IClosingAccount {
    accountType: factory.accountType;
    accountNumber: string;
}

/**
 * 口座解約
 */
export function close<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    /**
     * 所有者を指定しなければ、問答無用に口座番号から口座を解約します
     */
    ownedBy?: {
        id: string;
    };
    accountType: T;
    accountNumber: string;
}): IAccountsOperation<void> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        try {
            let closingAccount: IClosingAccount = {
                accountType: params.accountType,
                accountNumber: params.accountNumber
            };

            // 所有者を指定された場合、口座所有権を確認
            if (params.ownedBy !== undefined) {
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

                closingAccount = {
                    accountType: ownershipInfo.typeOfGood.accountType,
                    accountNumber: ownershipInfo.typeOfGood.accountNumber
                };
            }

            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }

            const accountService = new pecorinoapi.service.Account({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            await accountService.close(closingAccount);
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }
    };
}

/**
 * 口座検索
 */
export function search(params: {
    project: factory.project.IProject;
    conditions: factory.ownershipInfo.ISearchConditions<factory.ownershipInfo.AccountGoodType.Account>;
}): IAccountsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 口座所有権を検索
            const ownershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>(params.conditions);
            const accountNumbers = ownershipInfos.map((o) => o.typeOfGood.accountNumber);

            const typeOfGood = params.conditions.typeOfGood;
            if (typeOfGood === undefined) {
                throw new factory.errors.ArgumentNull('typeOfGood');
            }
            if (typeof typeOfGood.accountType !== 'string') {
                throw new factory.errors.ArgumentNull('typeOfGood.accountType');
            }

            if (accountNumbers.length > 0) {
                if (project.settings === undefined) {
                    throw new factory.errors.ServiceUnavailable('Project settings undefined');
                }
                if (project.settings.pecorino === undefined) {
                    throw new factory.errors.ServiceUnavailable('Project settings not found');
                }
                const accountService = new pecorinoapi.service.Account({
                    endpoint: project.settings.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                const accounts = await accountService.search({
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
export function searchMoneyTransferActions<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    ownedBy: {
        id: string;
    };
    ownedFrom?: Date;
    ownedThrough?: Date;
    conditions: pecorinoapi.factory.action.transfer.moneyTransfer.ISearchConditions<T>;
}): IAccountsOperation<factory.pecorino.action.transfer.moneyTransfer.IAction<T>[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        let actions: factory.pecorino.action.transfer.moneyTransfer.IAction<T>[] = [];
        try {
            const ownershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>({
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: params.conditions.accountType,
                    accountNumber: params.conditions.accountNumber
                    // accountNumbers: [params.conditions.accountNumber]
                },
                ownedBy: params.ownedBy,
                ownedFrom: params.ownedFrom,
                ownedThrough: params.ownedThrough
            });
            const ownershipInfo = ownershipInfos[0];
            if (ownershipInfo === undefined) {
                throw new factory.errors.NotFound('Account');
            }

            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }
            const accountService = new pecorinoapi.service.Account({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            actions = await accountService.searchMoneyTransferActions(params.conditions);
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
    project: factory.project.IProject;
    name: string;
    accountType: T;
}) {
    return async (repos: {
        /**
         * 口座番号リポジトリ
         */
        accountNumber: AccountNumberRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // 口座番号を発行
        const accountNumber = await repos.accountNumber.publish(new Date());

        let account: factory.pecorino.account.IAccount<T>;
        try {
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }
            const accountService = new pecorinoapi.service.Account({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            account = await accountService.open({
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
    project: factory.project.IProject;
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
        project: ProjectRepo;
    }) => {
        try {
            const project = await repos.project.findById({ id: params.project.id });

            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            const transaction = await depositService.start({
                typeOf: factory.pecorino.transactionType.Deposit,
                agent: {
                    typeOf: factory.personType.Person,
                    id: params.agent.id,
                    name: params.agent.name,
                    url: params.agent.url
                },
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
                object: {
                    amount: params.amount,
                    toLocation: {
                        typeOf: factory.pecorino.account.TypeOf.Account,
                        accountType: factory.accountType.Point,
                        accountNumber: params.toAccountNumber
                    },
                    description: params.notes
                },
                recipient: {
                    typeOf: factory.personType.Person,
                    id: params.recipient.id,
                    name: params.recipient.name,
                    url: params.recipient.url
                }
            });

            await depositService.confirm(transaction);
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }
    };
}
