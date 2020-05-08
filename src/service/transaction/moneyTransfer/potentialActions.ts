import * as factory from '../../../factory';

function createMoneyTransferActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.transfer.moneyTransfer.IAttributes[] {
    // 通貨転送アクション属性作成
    // type IFromLocation = factory.action.authorize.paymentMethod.prepaidCard.IPaymentCard;
    const authorizePaymentCardActions = <factory.action.authorize.paymentMethod.prepaidCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            // tslint:disable-next-line:no-suspicious-comment
            // TODO Chevre決済カードサービスに対して動的にコントロール
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.PrepaidCard);

    return authorizePaymentCardActions.map((a) => {
        const actionResult = <factory.action.authorize.paymentMethod.prepaidCard.IResult>a.result;

        if (a.object.fromLocation !== undefined) {
            // if ((<IFromLocation>a.object.fromLocation).accountType !== 'Coin') {
            //     throw new factory.errors.Argument('Transaction', `account type must be ${'Coin'}`);
            // }
        }

        if (a.object.toLocation !== undefined) {
            // if (a.object.toLocation.accountType !== 'Coin') {
            //     throw new factory.errors.Argument('Transaction', `account type must be ${'Coin'}`);
            // }
        }

        const fromLocation = <factory.action.transfer.moneyTransfer.IPaymentCard>params.transaction.object.fromLocation;

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
                currency: factory.chevre.priceCurrency.JPY
            },
            fromLocation: fromLocation,
            toLocation: params.transaction.object.toLocation,
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            },
            ...(typeof a.object.description === 'string') ? { description: a.object.description } : {}
        };
    });
}

/**
 * 取引のポストアクションを作成する
 */
export async function createPotentialActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): Promise<factory.transaction.IPotentialActions<factory.transactionType.MoneyTransfer>> {
    // 通貨転送アクション属性作成
    const moneyTransferActionAttributesList = createMoneyTransferActions(params);

    // まずは1転送アクションのみ対応
    if (moneyTransferActionAttributesList.length !== 1) {
        throw new factory.errors.Argument('Transaction', 'Number of moneyTransfer actions must be 1');
    }

    return {
        moneyTransfer: moneyTransferActionAttributesList
    };
}
