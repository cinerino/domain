// import * as COA from '@motionpicture/coa-service';
// import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
// import * as moment from 'moment';
// import { format } from 'util';

// import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

function createPayCreditCardActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] {
    const payCreditCardActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] = [];

    // クレジットカード決済アクション
    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);

    authorizeCreditCardActions.forEach((a) => {
        const result = <factory.action.authorize.paymentMethod.creditCard.IResult>a.result;
        if (result.paymentStatus === factory.paymentStatusType.PaymentDue) {
            payCreditCardActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: <factory.paymentMethodType.CreditCard>result.paymentMethod
                    },
                    price: result.amount,
                    priceCurrency: factory.priceCurrency.JPY,
                    entryTranArgs: result.entryTranArgs,
                    execTranArgs: result.execTranArgs
                }],
                agent: params.transaction.agent,
                purpose: <any>{
                    typeOf: params.transaction.typeOf,
                    id: params.transaction.id
                }
            });
        }
    });

    return payCreditCardActions;
}

function createPayAccountActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[] {
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.agent.id === params.transaction.agent.id)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);

    return authorizeAccountActions.map((a) => {
        const result = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: [{
                typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                paymentMethod: {
                    accountId: result.accountId,
                    additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                    name: result.name,
                    paymentMethodId: result.paymentMethodId,
                    totalPaymentDue: result.totalPaymentDue,
                    typeOf: <factory.paymentMethodType.Account>result.paymentMethod
                },
                pendingTransaction:
                    (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
            }],
            agent: params.transaction.agent,
            purpose: <any>{
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        };
    });
}

function createMoneyTransferActions<T extends factory.accountType>(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.transfer.moneyTransfer.IAttributes<T>[] {
    // 通貨転送アクション属性作成
    type IFromAccount = factory.action.authorize.paymentMethod.account.IAccount<factory.accountType>;
    const authorizeAccountDepositActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.agent.id === params.transaction.seller.id)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);

    return authorizeAccountDepositActions.map((a) => {
        const fromLocationName = (a.agent.name !== undefined)
            ? (typeof a.agent.name === 'string') ? a.agent.name : a.agent.name.ja
            : undefined;
        const toLocationName = (a.recipient.name !== undefined)
            ? (typeof a.recipient.name === 'string') ? a.recipient.name : a.recipient.name.ja
            : undefined;

        const actionResult = <factory.action.authorize.paymentMethod.account.IResult<T>>a.result;

        if (a.object.fromAccount !== undefined) {
            if ((<IFromAccount>a.object.fromAccount).accountType !== factory.accountType.Coin) {
                throw new factory.errors.Argument('Transaction', `account type must be ${factory.accountType.Coin}`);
            }
        }

        if (a.object.toAccount !== undefined) {
            if (a.object.toAccount.accountType !== factory.accountType.Coin) {
                throw new factory.errors.Argument('Transaction', `account type must be ${factory.accountType.Coin}`);
            }
        }

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.MoneyTransfer>factory.actionType.MoneyTransfer,
            ...(typeof a.object.notes === 'string') ? { description: a.object.notes } : {},
            result: {},
            object: {
                pendingTransaction: actionResult.pendingTransaction
            },
            agent: a.agent,
            recipient: a.recipient,
            amount: a.object.amount,
            fromLocation: (a.object.fromAccount !== undefined)
                ? {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: (<IFromAccount>a.object.fromAccount).accountType,
                    accountNumber: (<IFromAccount>a.object.fromAccount).accountNumber,
                    name: fromLocationName
                }
                : {
                    typeOf: a.agent.typeOf,
                    name: fromLocationName
                },
            toLocation: (a.object.toAccount !== undefined)
                ? {
                    typeOf: factory.pecorino.account.TypeOf.Account,
                    accountType: a.object.toAccount.accountType,
                    accountNumber: a.object.toAccount.accountNumber,
                    name: toLocationName
                }
                : {
                    typeOf: a.recipient.typeOf,
                    name: toLocationName
                },
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        };
    });
}

function validateAmount(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}) {
    // 決済方法が存在する場合金額チェック
    let priceByAgent = 0;
    let priceBySeller = 0;

    // 決済承認を確認
    Object.keys(factory.paymentMethodType)
        // 口座決済は除外
        // .filter((key) => (<any>factory.paymentMethodType)[key] !== factory.paymentMethodType.Account)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            priceByAgent += params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.agent.id === params.transaction.agent.id)
                .filter((a) => a.object.typeOf === paymentMethodType)
                .filter((a) => {
                    const totalPaymentDue = (<IAuthorizeAnyPaymentResult>a.result).totalPaymentDue;

                    return totalPaymentDue !== undefined && totalPaymentDue.currency === factory.priceCurrency.JPY;
                })
                .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
        });

    // 販売者が承認する転送金額
    priceBySeller += params.transaction.object.authorizeActions
        .filter((authorizeAction) => authorizeAction.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((authorizeAction) => authorizeAction.agent.id === params.transaction.seller.id)
        .filter((authorizeAction) => typeof authorizeAction.result.amount === 'number')
        .reduce((a, b) => a + (<number>b.result.amount), 0);

    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('Transaction', 'Transaction cannot be confirmed because amount not matched');
    }
}

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions<T extends factory.accountType>(params: {
    // potentialActions?: factory.transaction.moneyTransfer.IPotentialActionsParams;
    // seller: ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): Promise<factory.transaction.IPotentialActions<factory.transactionType.MoneyTransfer>> {
    // クレジットカード決済アクション
    const payCreditCardActions = createPayCreditCardActions(params);

    // 口座決済アクション
    const payAccountActions = createPayAccountActions(params);

    // 通貨転送アクション属性作成
    const moneyTransferActionAttributesList = createMoneyTransferActions<T>(params);

    // まずは1転送アクションのみ対応
    if (moneyTransferActionAttributesList.length !== 1) {
        throw new factory.errors.Argument('Transaction', 'Number of moneyTransfer actions must be 1');
    }

    validateAmount(params);

    return <any>{
        moneyTransfer: moneyTransferActionAttributesList,
        payAccount: payAccountActions,
        payCreditCard: payCreditCardActions
    };
}
