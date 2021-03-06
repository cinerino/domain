/**
 * 口座サービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

import * as factory from '../factory';

import { handlePecorinoError } from '../errorHandler';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';

type IOwnershipInfoWithDetail = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail>;
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
    accountNumber: string;
}): IAccountsOperation<void> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        try {
            const now = new Date();

            const closingAccount: IClosingAccount = {
                accountNumber: params.accountNumber
            };

            // 所有者を指定された場合、口座所有権を確認
            const ownerId = params.ownedBy?.id;
            if (typeof ownerId === 'string') {
                const accountOwnershipInfos = await repos.ownershipInfo.search({
                    limit: 1,
                    project: { id: { $eq: params.project.id } },
                    typeOfGood: { accountNumber: { $eq: closingAccount.accountNumber } },
                    ownedBy: { id: ownerId },
                    ownedFrom: now,
                    ownedThrough: now
                });
                const ownershipInfo = accountOwnershipInfos[0];
                if (ownershipInfo === undefined) {
                    throw new factory.errors.NotFound('Account');
                }
            }

            const accountService = new pecorinoapi.service.Account({
                endpoint: credentials.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            await accountService.close(closingAccount);
        } catch (error) {
            throw handlePecorinoError(error);
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

        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 口座所有権を検索
            const ownershipInfos = await repos.ownershipInfo.search(params.conditions);
            const accountNumbers = ownershipInfos.map((o) => (<factory.ownershipInfo.IAccount>o.typeOfGood).accountNumber);

            const typeOfGood = params.conditions.typeOfGood;
            if (typeOfGood === undefined) {
                throw new factory.errors.ArgumentNull('typeOfGood');
            }

            if (accountNumbers.length > 0) {
                const accountService = new pecorinoapi.service.Account({
                    endpoint: credentials.pecorino.endpoint,
                    auth: pecorinoAuthClient
                });
                const searchAccountResult = await accountService.search({
                    project: { id: { $eq: project.id } },
                    accountNumbers: accountNumbers,
                    statuses: [],
                    limit: 100
                });

                ownershipInfosWithDetail = ownershipInfos.map((o) => {
                    const account = searchAccountResult.data.find(
                        (a) => a.accountNumber === (<factory.ownershipInfo.IAccount>o.typeOfGood).accountNumber
                    );
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
    typeOfGood: {
        accountNumber: string;
    };
}): IAccountsOperation<factory.pecorino.action.transfer.moneyTransfer.IAction[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        let actions: factory.pecorino.action.transfer.moneyTransfer.IAction[] = [];
        try {
            const ownershipInfos = await repos.ownershipInfo.search({
                typeOfGood: {
                    accountNumber: { $eq: params.typeOfGood.accountNumber }
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
                endpoint: credentials.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            const searchMoneyTransferActionsResult = await accountService.searchMoneyTransferActions({
                ...params.conditions,
                // 口座番号条件は上書き
                accountNumber: params.typeOfGood.accountNumber,
                project: { id: { $eq: project.id } }
            });
            actions = searchMoneyTransferActionsResult.data;
        } catch (error) {
            throw handlePecorinoError(error);
        }

        return actions;
    };
}

/**
 * 所有口座を検索
 * 指定した口座タイプの所有口座を検索する
 * 最も古い所有口座をデフォルト口座として扱う使用なので、ソート条件は以下の通り
 */
export function findAccount(params: {
    customer: { id: string };
    project: { id: string };
    now: Date;
    /**
     * 口座タイプ
     */
    accountType: string;
}) {
    return async (repos: {
        project: ProjectRepo;
        ownershipInfo: OwnershipInfoRepo;
    }): Promise<factory.pecorino.account.IAccount> => {
        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const searchProductsResult = await productService.search({
            project: { id: { $eq: params.project.id } },
            typeOf: { $eq: chevre.factory.product.ProductType.PaymentCard }
        });
        const accountProduct = (<chevre.factory.product.IProduct[]>searchProductsResult.data)
            .find((p) => p.serviceOutput?.amount?.currency === params.accountType);
        if (accountProduct === undefined) {
            throw new factory.errors.NotFound(`${params.accountType} Account Product`);
        }

        let accountOwnershipInfos = await search({
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            conditions: {
                // 最も古い所有口座をデフォルト口座として扱う使用なので、ソート条件はこの通り
                sort: { ownedFrom: factory.sortType.Ascending },
                limit: 1,
                typeOfGood: { typeOf: { $eq: <string>accountProduct.serviceOutput?.typeOf } },
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
            accountOwnershipInfos.filter(
                (o) => (<factory.pecorino.account.IAccount>o.typeOfGood).status === factory.pecorino.accountStatusType.Opened
            );
        if (accountOwnershipInfos.length === 0) {
            throw new factory.errors.NotFound('accountOwnershipInfos');
        }

        return <factory.pecorino.account.IAccount>accountOwnershipInfos[0].typeOfGood;
    };
}
