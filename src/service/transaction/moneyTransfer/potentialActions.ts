// import * as COA from '@motionpicture/coa-service';
// import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
// import * as moment from 'moment';
// import { format } from 'util';

// import * as emailMessageBuilder from '../../../emailMessageBuilder';

import * as factory from '../../../factory';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

/**
 * 取引のポストアクションを作成する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function createPotentialActions<T extends factory.accountType>(params: {
    // potentialActions?: factory.transaction.moneyTransfer.IPotentialActionsParams;
    // seller: ISeller;
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): Promise<factory.transaction.IPotentialActions<factory.transactionType.MoneyTransfer>> {
    const project: factory.project.IProject = params.transaction.project;

    // クレジットカード支払いアクション
    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);
    const payCreditCardActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] = [];
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

    // 口座支払いアクション
    // const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
    //     params.transaction.object.authorizeActions
    //         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
    //         .filter((a) => a.result !== undefined)
    //         .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);
    // const payAccountActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[] =
    //     authorizeAccountActions.map((a) => {
    //         const result = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result;

    //         return {
    //             project: params.transaction.project,
    //             typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
    //             object: [{
    //                 typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
    //                 paymentMethod: {
    //                     accountId: result.accountId,
    //                     additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
    //                     name: result.name,
    //                     paymentMethodId: result.paymentMethodId,
    //                     totalPaymentDue: result.totalPaymentDue,
    //                     typeOf: <factory.paymentMethodType.Account>result.paymentMethod
    //                 },
    //                 pendingTransaction:
    //                     (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
    //             }],
    //             agent: params.transaction.agent,
    //             purpose: {
    //                 project: params.order.project,
    //                 typeOf: params.order.typeOf,
    //                 seller: params.order.seller,
    //                 customer: params.order.customer,
    //                 confirmationNumber: params.order.confirmationNumber,
    //                 orderNumber: params.order.orderNumber,
    //                 price: params.order.price,
    //                 priceCurrency: params.order.priceCurrency,
    //                 orderDate: params.order.orderDate
    //             }
    //         };
    //     });

    // 通貨転送アクション属性作成
    type IFromAccount = factory.action.authorize.paymentMethod.account.IAccount<factory.accountType>;
    const authorizeAccountPaymentActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);
    const moneyTransferActionAttributesList: factory.action.transfer.moneyTransfer.IAttributes<T>[] =
        authorizeAccountPaymentActions.map((a) => {
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
                project: project,
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

    // まずは1転送アクションのみ対応
    if (moneyTransferActionAttributesList.length !== 1) {
        throw new factory.errors.Argument('Transaction', 'Number of moneyTransfer actions must be 1');
    }

    // 決済方法が存在する場合金額チェック
    let priceByAgent = 0;
    let priceBySeller = 0;

    // 決済承認を確認
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            priceByAgent += params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
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

    return {
        moneyTransfer: moneyTransferActionAttributesList,
        payCreditCard: payCreditCardActions
    };
}
