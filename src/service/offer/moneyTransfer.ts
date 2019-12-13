import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handlePecorinoError } from '../../errorHandler';

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
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

        let requestBody: factory.pecorino.transaction.deposit.IStartParams<T>;
        let responseBody: factory.action.authorize.offer.moneyTransfer.IResponseBody<T>;

        try {
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });

            requestBody = {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: pecorinoapi.factory.transactionType.Deposit,
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
            // try {
            //     const actionError = { ...error, message: error.message, name: error.name };
            //     await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            // } catch (__) {
            //     // no op
            // }

            error = handlePecorinoError(error);
            throw error;
        }

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.moneyTransfer.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.actionType.MoneyTransfer,
                amount: params.object.amount,
                toLocation: params.object.toLocation,
                pendingTransaction: responseBody
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

        try {
            // no op
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handlePecorinoError(error);
            throw error;
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

export function voidTransaction<T extends factory.accountType>(params: factory.task.IData<factory.taskName.VoidMoneyTransfer>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined
            || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            const transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        let authorizeActions: factory.action.authorize.offer.moneyTransfer.IAction<T>[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.offer.moneyTransfer.IAction<T>>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.offer.moneyTransfer.IAction<T>[]>
                await repos.action.searchByPurpose({
                    typeOf: factory.actionType.AuthorizeAction,
                    purpose: {
                        typeOf: params.purpose.typeOf,
                        id: params.purpose.id
                    }
                })
                    .then((actions) => actions
                        .filter((a) => a.object.typeOf === factory.actionType.MoneyTransfer)
                    );
        }

        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            const pendingTransaction = action.object.pendingTransaction;

            if (pendingTransaction !== undefined && pendingTransaction !== null) {
                await depositService.cancel({ id: pendingTransaction.id });
            }
        }));
    };
}

export function settleTransaction(params: factory.task.IData<factory.taskName.MoneyTransfer>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            if (project.settings === undefined
                || project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }

            const pendingTransaction = params.object.pendingTransaction;

            switch (pendingTransaction.typeOf) {
                case pecorinoapi.factory.transactionType.Deposit:
                    const depositService = new pecorinoapi.service.transaction.Deposit({
                        endpoint: project.settings.pecorino.endpoint,
                        auth: pecorinoAuthClient
                    });
                    await depositService.confirm({ id: pendingTransaction.id });

                    break;

                case pecorinoapi.factory.transactionType.Transfer:
                    const transferService = new pecorinoapi.service.transaction.Transfer({
                        endpoint: project.settings.pecorino.endpoint,
                        auth: pecorinoAuthClient
                    });
                    await transferService.confirm({ id: pendingTransaction.id });

                    break;

                case pecorinoapi.factory.transactionType.Withdraw:
                    const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                        endpoint: project.settings.pecorino.endpoint,
                        auth: pecorinoAuthClient
                    });
                    await withdrawService.confirm({ id: pendingTransaction.id });

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
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.transfer.moneyTransfer.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
