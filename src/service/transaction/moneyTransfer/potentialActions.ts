import * as factory from '../../../factory';

function createMoneyTransferActions<T extends string>(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.transfer.moneyTransfer.IAttributes<T>[] {
    // 通貨転送アクション属性作成
    type IFromAccount = factory.action.authorize.paymentMethod.account.IAccount<string>;
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<string>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);

    return authorizeAccountActions.map((a) => {
        const actionResult = <factory.action.authorize.paymentMethod.account.IResult<T>>a.result;

        if (a.object.fromAccount !== undefined) {
            if ((<IFromAccount>a.object.fromAccount).accountType !== 'Coin') {
                throw new factory.errors.Argument('Transaction', `account type must be ${'Coin'}`);
            }
        }

        if (a.object.toAccount !== undefined) {
            if (a.object.toAccount.accountType !== 'Coin') {
                throw new factory.errors.Argument('Transaction', `account type must be ${'Coin'}`);
            }
        }

        const fromLocation = <factory.action.transfer.moneyTransfer.IAccount<T>>params.transaction.object.fromLocation;

        return {
            project: params.transaction.project,
            typeOf: <factory.actionType.MoneyTransfer>factory.actionType.MoneyTransfer,
            result: {},
            object: {
                pendingTransaction: actionResult.pendingTransaction
            },
            agent: a.agent,
            recipient: a.recipient,
            amount: {
                typeOf: 'MonetaryAmount',
                value: Number(a.object.amount),
                currency: fromLocation.accountType
            },
            fromLocation: fromLocation,
            toLocation: params.transaction.object.toLocation,
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            },
            ...(typeof a.object.notes === 'string') ? { description: a.object.notes } : {}
        };
    });
}

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions<T extends string>(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): Promise<factory.transaction.IPotentialActions<factory.transactionType.MoneyTransfer>> {
    // 通貨転送アクション属性作成
    const moneyTransferActionAttributesList = createMoneyTransferActions<T>(params);

    // まずは1転送アクションのみ対応
    if (moneyTransferActionAttributesList.length !== 1) {
        throw new factory.errors.Argument('Transaction', 'Number of moneyTransfer actions must be 1');
    }

    return {
        moneyTransfer: moneyTransferActionAttributesList
    };
}
