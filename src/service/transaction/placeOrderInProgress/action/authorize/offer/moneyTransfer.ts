import * as pecorino from '@pecorino/api-nodejs-client';
import * as moment from 'moment';

import { credentials } from '../../../../../../credentials';

import * as factory from '../../../../../../factory';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as ProjectRepo } from '../../../../../../repo/project';
import { MongoRepository as SellerRepo } from '../../../../../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const pecorinoAuthClient = new pecorino.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function authorize<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.offer.moneyTransfer.IObject<T>;
    recipient: factory.pecorino.transaction.deposit.IRecipient;
    purpose: factory.action.authorize.offer.moneyTransfer.IPurpose;
}): ICreateOperation<factory.action.authorize.offer.moneyTransfer.IAction<T>> {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const seller = transaction.seller;

        if (project.settings === undefined
            || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.moneyTransfer.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.actionType.MoneyTransfer,
                amount: params.object.amount,
                toLocation: params.object.toLocation
                // ...(depositTransaction !== undefined)
                //     ? { pendingTransaction: depositTransaction }
                //     : {}
            },
            agent: {
                project: transaction.seller.project,
                id: transaction.seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            recipient: transaction.agent,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        let requestBody: factory.pecorino.transaction.deposit.IStartParams<T>;
        let responseBody: factory.action.authorize.offer.moneyTransfer.IResponseBody<T>;

        try {
            const depositService = new pecorino.service.transaction.Deposit({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });

            requestBody = {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: pecorino.factory.transactionType.Deposit,
                agent: {
                    typeOf: transaction.agent.typeOf,
                    name: transaction.agent.id,
                    ...{
                        identifier: [
                            { name: 'transaction', value: transaction.id },
                            {
                                name: 'transactionExpires',
                                value: moment(transaction.expires)
                                    .toISOString()
                            }
                        ]
                    }
                },
                object: {
                    amount: params.object.amount,
                    // fromLocation?: IAnonymousLocation;
                    toLocation: params.object.toLocation
                    // description?: string;
                },
                recipient: params.recipient,
                expires: moment(transaction.expires)
                    .add(1, 'month')
                    .toDate() // 余裕を持って
            };

            responseBody = await depositService.start(requestBody);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw new factory.errors.ServiceUnavailable('Unexepected error occurred');
        }

        // アクションを完了
        const result: factory.action.authorize.offer.moneyTransfer.IResult<T> = {
            price: params.object.amount,
            priceCurrency: factory.priceCurrency.JPY,
            requestBody: requestBody,
            responseBody: responseBody
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function voidTransaction<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.offer.moneyTransfer.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }
        // MongoDBでcompleteステータスであるにも関わらず、Chevreでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = <factory.action.authorize.offer.moneyTransfer.IAction<T>>
            await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

        if (project.settings === undefined
            || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const depositService = new pecorino.service.transaction.Deposit({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });

        const pendingTransaction = action.object.pendingTransaction;

        if (pendingTransaction !== undefined) {
            // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
            await depositService.cancel({ id: pendingTransaction.id });
        }
    };
}
