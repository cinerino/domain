import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleChevreError } from '../../errorHandler';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function authorize(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.offer.monetaryAmount.IObject;
    purpose: factory.action.authorize.offer.monetaryAmount.IPurpose;
}): ICreateOperation<factory.action.authorize.offer.monetaryAmount.IAction> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const seller = transaction.seller;

        const { requestBody, responseBody } = await processStartDepositTransaction({
            project: params.project,
            transaction: transaction,
            object: params.object
        });

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.monetaryAmount.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                typeOf: factory.chevre.offerType.Offer,
                itemOffered: params.object.itemOffered,
                seller: {
                    ...transaction.seller,
                    name: (typeof transaction.seller.name === 'string')
                        ? transaction.seller.name
                        : String(transaction.seller.name?.ja)
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

            error = handleChevreError(error);
            throw error;
        }

        const result: factory.action.authorize.offer.monetaryAmount.IResult = {
            price: Number(params.object.itemOffered.value),
            priceCurrency: factory.priceCurrency.JPY,
            requestBody: requestBody,
            responseBody: responseBody
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

// tslint:disable-next-line:max-func-body-length
async function processStartDepositTransaction(params: {
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
    object: factory.action.authorize.offer.monetaryAmount.IObject;
}): Promise<{
    requestBody: factory.account.transaction.deposit.IStartParamsWithoutDetail;
    // requestBody: factory.chevre.assetTransaction.moneyTransfer.IStartParamsWithoutDetail;
    responseBody: factory.action.authorize.offer.monetaryAmount.IResponseBody;
}> {
    let requestBody: factory.account.transaction.deposit.IStartParamsWithoutDetail;
    // let requestBody: factory.chevre.assetTransaction.moneyTransfer.IStartParamsWithoutDetail;
    let responseBody: factory.action.authorize.offer.monetaryAmount.IResponseBody;

    try {
        const depositService = new chevre.service.accountTransaction.Deposit({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });
        // const moneyTransferService = new chevre.service.assetTransaction.MoneyTransfer({
        //     endpoint: credentials.chevre.endpoint,
        //     auth: chevreAuthClient,
        //     project: { id: params.project.id }
        // });

        const description = `for ${params.transaction.typeOf} Transaction ${params.transaction.id}`;

        // 最大1ヵ月のオーソリ
        const expires = moment()
            .add(1, 'month')
            .toDate();

        // 販売者が取引人に入金
        requestBody = {
            typeOf: chevre.factory.account.transactionType.Deposit,
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            agent: {
                project: params.transaction.project,
                typeOf: params.transaction.seller.typeOf,
                id: params.transaction.seller.id,
                name: (typeof params.transaction.seller.name === 'string')
                    ? params.transaction.seller.name
                    : String(params.transaction.seller.name?.ja)
            },
            object: {
                amount: { value: Number(params.object.itemOffered.value) },
                fromLocation: {
                    typeOf: params.transaction.agent.typeOf,
                    id: params.transaction.agent.id,
                    name: (typeof params.transaction.agent.name === 'string')
                        ? params.transaction.agent.name
                        : `${params.transaction.typeOf} Transaction ${params.transaction.id}`
                },
                toLocation: { accountNumber: params.object.toLocation.identifier },
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
        // requestBody = {
        //     typeOf: chevre.factory.assetTransactionType.MoneyTransfer,
        //     project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
        //     agent: {
        //         typeOf: params.transaction.seller.typeOf,
        //         id: params.transaction.seller.id,
        //         name: (typeof params.transaction.seller.name === 'string')
        //             ? params.transaction.seller.name
        //             : String(params.transaction.seller.name?.ja)
        //     },
        //     object: {
        //         amount: {
        //             typeOf: 'MonetaryAmount',
        //             value: Number(params.object.itemOffered.value),
        //             currency: factory.chevre.priceCurrency.JPY
        //         },
        //         fromLocation: {
        //             typeOf: params.transaction.agent.typeOf,
        //             id: params.transaction.agent.id,
        //             name: (typeof params.transaction.agent.name === 'string')
        //                 ? params.transaction.agent.name
        //                 : `${params.transaction.typeOf} Transaction ${params.transaction.id}`
        //         },
        //         toLocation: params.object.toLocation,
        //         description: description,
        //         pendingTransaction: {
        //             typeOf: factory.account.transactionType.Deposit,
        //             id: '' // 空でok
        //         }
        //     },
        //     recipient: {
        //         typeOf: params.transaction.agent.typeOf,
        //         id: params.transaction.agent.id,
        //         name: (typeof params.transaction.agent.name === 'string')
        //             ? params.transaction.agent.name
        //             : `${params.transaction.typeOf} Transaction ${params.transaction.id}`
        //     },
        //     expires: expires
        // };

        responseBody = await depositService.start(requestBody);
        // responseBody = await moneyTransferService.start(requestBody);
    } catch (error) {
        error = handleChevreError(error);
        throw error;
    }

    return { requestBody, responseBody };
}

export function voidTransaction(params: factory.task.IData<factory.taskName.VoidMoneyTransferTransaction>) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        // const moneyTransferService = new chevre.service.assetTransaction.MoneyTransfer({
        //     endpoint: credentials.chevre.endpoint,
        //     auth: chevreAuthClient,
        //     project: { id: params.project.id }
        // });
        const depositService = new chevre.service.accountTransaction.Deposit({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });
        const transferService = new chevre.service.accountTransaction.Transfer({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });
        const withdrawService = new chevre.service.accountTransaction.Withdraw({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient,
            project: { id: params.project.id }
        });

        let transaction: factory.transaction.ITransaction<factory.transactionType> | undefined;
        if (params.agent !== undefined && params.agent !== null && typeof params.agent.id === 'string') {
            transaction = await repos.transaction.findInProgressById({
                typeOf: params.purpose.typeOf,
                id: params.purpose.id
            });
        }

        let authorizeActions: factory.action.authorize.offer.monetaryAmount.IAction[];

        if (typeof params.id === 'string') {
            const authorizeAction = <factory.action.authorize.offer.monetaryAmount.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

            // 取引内のアクションかどうか確認
            if (transaction !== undefined) {
                if (authorizeAction.purpose.typeOf !== transaction.typeOf || authorizeAction.purpose.id !== transaction.id) {
                    throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
                }
            }

            authorizeActions = [authorizeAction];
        } else {
            authorizeActions = <factory.action.authorize.offer.monetaryAmount.IAction[]>await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            });
            authorizeActions = authorizeActions.filter((a) => a.object.typeOf === 'Offer')
                .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');
        }

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            const pendingTransaction = action.object.pendingTransaction;

            if (pendingTransaction !== undefined && pendingTransaction !== null) {
                switch (pendingTransaction.typeOf) {
                    case factory.account.transactionType.Deposit:
                        await depositService.cancel({ id: pendingTransaction.id });
                        break;

                    case factory.account.transactionType.Transfer:
                        await transferService.cancel({ id: pendingTransaction.id });
                        break;

                    case factory.account.transactionType.Withdraw:
                        await withdrawService.cancel({ id: pendingTransaction.id });
                        break;

                    default:
                        throw new factory.errors.NotImplemented(`'${(<any>pendingTransaction).typeOf}' not implemented`);

                }
                // await moneyTransferService.cancel({ id: pendingTransaction.id });
            }
        }));
    };
}

export function settleTransaction(params: factory.task.IData<factory.taskName.ConfirmMoneyTransfer>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        const action = await repos.action.start(params);

        const pendingTransaction = params.object.pendingTransaction;
        try {
            switch (pendingTransaction.typeOf) {
                case factory.account.transactionType.Deposit:
                    const depositService = new chevre.service.accountTransaction.Deposit({
                        endpoint: credentials.chevre.endpoint,
                        auth: chevreAuthClient,
                        project: { id: params.project.id }
                    });
                    await depositService.confirm({ id: pendingTransaction.id });

                    break;

                case factory.account.transactionType.Transfer:
                    const transferService = new chevre.service.accountTransaction.Transfer({
                        endpoint: credentials.chevre.endpoint,
                        auth: chevreAuthClient,
                        project: { id: params.project.id }
                    });
                    await transferService.confirm({ id: pendingTransaction.id });

                    break;

                case factory.account.transactionType.Withdraw:
                    const withdrawService = new chevre.service.accountTransaction.Withdraw({
                        endpoint: credentials.chevre.endpoint,
                        auth: chevreAuthClient,
                        project: { id: params.project.id }
                    });
                    await withdrawService.confirm({ id: pendingTransaction.id });

                    break;

                default:
                    throw new factory.errors.NotImplemented(`'${(<any>pendingTransaction).typeOf}' not implemented`);
            }
            // const moneyTransferService = new chevre.service.assetTransaction.MoneyTransfer({
            //     endpoint: credentials.chevre.endpoint,
            //     auth: chevreAuthClient,
            //     project: { id: params.project.id }
            // });

            // const pendingTransaction = params.object.pendingTransaction;

            // await moneyTransferService.confirm({ id: pendingTransaction.id });
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

        const actionResult: factory.action.interact.confirm.moneyTransfer.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
