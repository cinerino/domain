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
    object: factory.action.authorize.offer.monetaryAmount.IObject<T>;
    purpose: factory.action.authorize.offer.monetaryAmount.IPurpose;
}): ICreateOperation<factory.action.authorize.offer.monetaryAmount.IAction<T>> {
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

        const { requestBody, responseBody } = await processStartDepositTransaction<T>({
            project: project,
            transaction: transaction,
            object: params.object
        });

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.monetaryAmount.IAttributes<T> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: 'Offer',
                itemOffered: params.object.itemOffered,
                seller: {
                    ...transaction.seller,
                    name: transaction.seller.name.ja
                },
                price: params.object.itemOffered.value,
                priceCurrency: factory.priceCurrency.JPY,
                // typeOf: factory.actionType.MoneyTransfer,
                // amount: params.object.amount,
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

        const result: factory.action.authorize.offer.monetaryAmount.IResult<T> = {
            price: Number(params.object.itemOffered.value),
            priceCurrency: factory.priceCurrency.JPY,
            requestBody: requestBody,
            responseBody: responseBody
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

async function processStartDepositTransaction<T extends factory.accountType>(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
    object: factory.action.authorize.offer.monetaryAmount.IObject<T>;
}): Promise<{
    requestBody: factory.pecorino.transaction.deposit.IStartParams<T>;
    responseBody: factory.action.authorize.offer.monetaryAmount.IResponseBody<T>;
}> {
    let requestBody: factory.pecorino.transaction.deposit.IStartParams<T>;
    let responseBody: factory.action.authorize.offer.monetaryAmount.IResponseBody<T>;

    if (params.project.settings === undefined
        || params.project.settings.pecorino === undefined) {
        throw new factory.errors.ServiceUnavailable('Project settings undefined');
    }

    try {
        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: params.project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });

        const description = `for ${params.transaction.typeOf} Transaction ${params.transaction.id}`;

        // 最大1ヵ月のオーソリ
        const expires = moment()
            .add(1, 'month')
            .toDate();

        // 販売者が取引人に入金
        requestBody = {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: pecorinoapi.factory.transactionType.Deposit,
            agent: {
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: params.transaction.seller.name.ja
            },
            object: {
                amount: Number(params.object.itemOffered.value),
                fromLocation: {
                    typeOf: params.transaction.agent.typeOf,
                    id: params.transaction.agent.id,
                    name: (typeof params.transaction.agent.name === 'string')
                        ? params.transaction.agent.name
                        : `${params.transaction.typeOf} Transaction ${params.transaction.id}`
                },
                toLocation: params.object.toLocation,
                description: description
            },
            recipient: {
                typeOf: params.transaction.agent.typeOf,
                id: params.transaction.agent.id,
                name: (typeof params.transaction.agent.name === 'string')
                    ? params.transaction.agent.name
                    : `${params.transaction.typeOf} Transaction ${params.transaction.id}`
            },
            expires: expires
        };

        responseBody = await depositService.start(requestBody);
    } catch (error) {
        error = handlePecorinoError(error);
        throw error;
    }

    return { requestBody, responseBody };
}

export function voidTransaction<T extends factory.accountType>(params: factory.task.IData<factory.taskName.VoidMoneyTransfer>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        let transaction: factory.transaction.ITransaction<factory.transactionType> | undefined;
        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
        }

        let authorizeActions: factory.action.authorize.offer.monetaryAmount.IAction<T>[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.offer.monetaryAmount.IAction<T>>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (transaction !== undefined) {
                if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                    throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
                }
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.offer.monetaryAmount.IAction<T>[]>await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            });
            authorizeActions = authorizeActions.filter((a) => a.object.typeOf === 'Offer')
                .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');
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
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw error;
        }

        const actionResult: factory.action.transfer.moneyTransfer.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
