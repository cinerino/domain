/**
 * 口座サービス
 */
import { credentials } from '../credentials';

import * as chevre from '../chevre';

import { factory } from '../factory';

import { handleChevreError } from '../errorHandler';

type IOwnershipInfoWithDetail = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood | factory.ownershipInfo.IGoodWithDetail>;
type IAccountsOperation<T> = (repos: {
    account: chevre.service.Account;
    ownershipInfo: chevre.service.OwnershipInfo;
}) => Promise<T>;
type ISearchOperation<T> = (repos: {
    ownershipInfo: chevre.service.OwnershipInfo;
}) => Promise<T>;

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
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
        account: chevre.service.Account;
        ownershipInfo: chevre.service.OwnershipInfo;
    }) => {
        try {
            const now = new Date();

            const closingAccount: IClosingAccount = {
                accountNumber: params.accountNumber
            };

            // 所有者を指定された場合、口座所有権を確認
            const ownerId = params.ownedBy?.id;
            if (typeof ownerId === 'string') {
                const searchOwnershipInfosResult = await repos.ownershipInfo.search({
                    limit: 1,
                    project: { id: { $eq: params.project.id } },
                    typeOfGood: { accountNumber: { $eq: closingAccount.accountNumber } },
                    ownedBy: { id: ownerId },
                    ownedFrom: now,
                    ownedThrough: now
                });
                const accountOwnershipInfos = searchOwnershipInfosResult.data;
                const ownershipInfo = accountOwnershipInfos[0];
                if (ownershipInfo === undefined) {
                    throw new factory.errors.NotFound('Account');
                }
            }

            // chevreで実装
            await repos.account.close(closingAccount);
        } catch (error) {
            throw handleChevreError(error);
        }
    };
}

/**
 * 口座検索
 */
export function search(params: {
    project: factory.project.IProject;
    conditions: factory.ownershipInfo.ISearchConditions;
}): ISearchOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: chevre.service.OwnershipInfo;
    }) => {
        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            const typeOfGood = params.conditions.typeOfGood;
            if (typeOfGood === undefined) {
                throw new factory.errors.ArgumentNull('typeOfGood');
            }

            const searchConditions: factory.ownershipInfo.ISearchConditions = {
                ...params.conditions,
                project: { id: { $eq: params.project.id } },
                typeOfGood: {
                    ...params.conditions.typeOfGood,
                    issuedThrough: {
                        ...params.conditions.typeOfGood?.issuedThrough,
                        // 発行サービスタイプをPaymentCardに自動指定(しないと所有物詳細を取得できない)
                        typeOf: { $eq: chevre.factory.product.ProductType.PaymentCard }
                    }
                }
            };

            // 口座所有権を検索
            const searchOwnershipInfosResult = await repos.ownershipInfo.search({
                ...searchConditions,
                // chevreの所有権検索の中で、口座詳細も検索する
                includeGoodWithDetails: '1'
            });
            const ownershipInfos = searchOwnershipInfosResult.data;

            ownershipInfosWithDetail = ownershipInfos;
        } catch (error) {
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
    conditions: factory.account.action.moneyTransfer.ISearchConditions;
    typeOfGood: {
        accountNumber: string;
    };
}): IAccountsOperation<factory.account.action.moneyTransfer.IAction[]> {
    return async (repos: {
        account: chevre.service.Account;
        ownershipInfo: chevre.service.OwnershipInfo;
    }) => {
        let actions: factory.account.action.moneyTransfer.IAction[] = [];
        try {
            const searchOwnershipInfosResult = await repos.ownershipInfo.search({
                project: { id: { $eq: params.project.id } },
                typeOfGood: {
                    accountNumber: { $eq: params.typeOfGood.accountNumber }
                },
                ownedBy: params.ownedBy,
                ownedFrom: params.ownedFrom,
                ownedThrough: params.ownedThrough
            });
            const ownershipInfos = searchOwnershipInfosResult.data;
            const ownershipInfo = ownershipInfos[0];
            if (ownershipInfo === undefined) {
                throw new factory.errors.NotFound('Account');
            }

            // chevreで実装
            const searchMoneyTransferActionsResult = await repos.account.searchMoneyTransferActions({
                ...params.conditions,
                // 口座番号条件は上書き
                accountNumber: params.typeOfGood.accountNumber,
                project: { id: { $eq: params.project.id } }
            });
            actions = searchMoneyTransferActionsResult.data;
        } catch (error) {
            throw handleChevreError(error);
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
}): ISearchOperation<factory.account.IAccount> {
    return async (repos: {
        ownershipInfo: chevre.service.OwnershipInfo;
    }): Promise<factory.account.IAccount> => {
        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
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
            ownershipInfo: repos.ownershipInfo
        });

        // 開設口座に絞る
        accountOwnershipInfos =
            accountOwnershipInfos.filter(
                (o) => (<factory.account.IAccount>o.typeOfGood).status === factory.accountStatusType.Opened
            );
        if (accountOwnershipInfos.length === 0) {
            throw new factory.errors.NotFound('accountOwnershipInfos');
        }

        return <factory.account.IAccount>accountOwnershipInfos[0].typeOfGood;
    };
}
