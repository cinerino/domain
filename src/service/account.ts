/**
 * 口座サービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

import * as factory from '../factory';

import { handleChevreError, handlePecorinoError } from '../errorHandler';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';

type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.ownershipInfo.AccountGoodType.Account>>;
type IAccountsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    project: ProjectRepo;
}) => Promise<T>;

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
    scopes: [],
    state: ''
});

export interface IClosingAccount {
    accountType: string;
    accountNumber: string;
}

/**
 * 口座解約
 */
export function close(params: {
    project: factory.project.IProject;
    /**
     * 所有者を指定しなければ、問答無用に口座番号から口座を解約します
     */
    ownedBy?: {
        id: string;
    };
    accountType: string;
    accountNumber: string;
}): IAccountsOperation<void> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.pecorino?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

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
    conditions: factory.ownershipInfo.ISearchConditions;
}): IAccountsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.pecorino?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

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
                const accountService = new pecorinoapi.service.Account({
                    endpoint: project.settings.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                const searchAccountResult = await accountService.search({
                    project: { id: { $eq: project.id } },
                    accountType: typeOfGood.accountType,
                    accountNumbers: accountNumbers,
                    statuses: [],
                    limit: 100
                });

                ownershipInfosWithDetail = ownershipInfos.map((o) => {
                    const account = searchAccountResult.data.find((a) => a.accountNumber === o.typeOfGood.accountNumber);
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
export function searchMoneyTransferActions(params: {
    project: factory.project.IProject;
    ownedBy: {
        id: string;
    };
    ownedFrom?: Date;
    ownedThrough?: Date;
    conditions: pecorinoapi.factory.action.transfer.moneyTransfer.ISearchConditions;
}): IAccountsOperation<factory.pecorino.action.transfer.moneyTransfer.IAction[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.pecorino?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        let actions: factory.pecorino.action.transfer.moneyTransfer.IAction[] = [];
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

            const accountService = new pecorinoapi.service.Account({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            const searchMoneyTransferActionsResult = await accountService.searchMoneyTransferActions({
                ...params.conditions,
                project: { id: { $eq: project.id } }
            });
            actions = searchMoneyTransferActionsResult.data;
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
export function openWithoutOwnershipInfo(params: {
    project: factory.project.IProject;
    name: string;
    accountType: string;
}) {
    return async (repos: {
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }
        if (typeof project.settings?.pecorino?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const serviceOutputIdentifierService = new chevre.service.ServiceOutputIdentifier({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const accountService = new pecorinoapi.service.Account({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });

        let account: factory.pecorino.account.IAccount;
        try {
            // 口座番号を発行
            const publishIdentifierResult = await serviceOutputIdentifierService.publish({
                project: { id: project.id }
            });

            account = await accountService.open({
                project: { typeOf: project.typeOf, id: project.id },
                accountType: params.accountType,
                accountNumber: publishIdentifierResult.identifier,
                name: params.name
            });
        } catch (error) {
            error = handleChevreError(error);
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
    agent: pecorinoapi.factory.transaction.deposit.IAgent;
    object: pecorinoapi.factory.transaction.deposit.IObject;
    recipient: pecorinoapi.factory.transaction.deposit.IRecipient;
}) {
    return async (repos: {
        project: ProjectRepo;
    }) => {
        try {
            const project = await repos.project.findById({ id: params.project.id });
            if (typeof project.settings?.chevre?.endpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });
            const { transactionNumber } = await transactionNumberService.publish({
                project: { id: project.id }
            });

            // Chevreで入金
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            await moneyTransferService.start({
                transactionNumber: transactionNumber,
                project: { typeOf: project.typeOf, id: project.id },
                typeOf: chevre.factory.transactionType.MoneyTransfer,
                agent: {
                    ...params.agent
                },
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
                object: {
                    amount: {
                        value: params.object.amount
                    },
                    fromLocation: params.agent,
                    toLocation: {
                        typeOf: params.object.toLocation.accountType,
                        identifier: params.object.toLocation.accountNumber
                    },
                    description: params.object.description,
                    pendingTransaction: {
                        typeOf: factory.pecorino.transactionType.Deposit
                    },
                    ...{
                        ignorePaymentCard: true
                    }
                },
                recipient: <any>{
                    ...params.recipient
                }
            });

            await moneyTransferService.confirm({ transactionNumber: transactionNumber });
        } catch (error) {
            error = handleChevreError(error);
            error = handlePecorinoError(error);
            throw error;
        }
    };
}

/**
 * 所有口座を検索
 * 最も古い所有口座をデフォルト口座として扱う使用なので、ソート条件は以下の通り
 */
export function findAccount(params: {
    customer: { id: string };
    project: { id: string };
    now: Date;
    accountType: string;
}) {
    return async (repos: {
        project: ProjectRepo;
        ownershipInfo: OwnershipInfoRepo;
    }): Promise<factory.pecorino.account.IAccount> => {
        let accountOwnershipInfos = await search({
            project: { typeOf: factory.organizationType.Project, id: params.project.id },
            conditions: {
                sort: { ownedFrom: factory.sortType.Ascending },
                limit: 1,
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: params.accountType
                },
                ownedBy: { id: params.customer.id },
                ownedFrom: params.now,
                ownedThrough: params.now
            }
        })({
            ownershipInfo: repos.ownershipInfo,
            project: repos.project
        });

        // 開設口座に絞る
        accountOwnershipInfos =
            accountOwnershipInfos.filter((o) => o.typeOfGood.status === factory.pecorino.accountStatusType.Opened);
        if (accountOwnershipInfos.length === 0) {
            throw new factory.errors.NotFound('accountOwnershipInfos');
        }

        return accountOwnershipInfos[0].typeOfGood;
    };
}
