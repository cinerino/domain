import * as factory from '../../../factory';

export type IAuthorizeMoneyTransferOffer = factory.action.authorize.offer.monetaryAmount.IAction;

function createMoneyTransferActions(params: {
    transaction: factory.transaction.ITransaction<factory.transactionType.MoneyTransfer>;
}): factory.action.transfer.moneyTransfer.IAttributes[] {
    const moneyTransferActions: factory.action.transfer.moneyTransfer.IAttributes[] = [];

    const authorizeMoneyTransferActions = (<IAuthorizeMoneyTransferOffer[]>params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered !== undefined && a.object.itemOffered.typeOf === 'MonetaryAmount');

    authorizeMoneyTransferActions.forEach((a) => {
        const actionResult = <factory.action.authorize.offer.monetaryAmount.IResult>a.result;
        const pendingTransaction = a.object.pendingTransaction;

        const fromLocation = params.transaction.object.fromLocation;

        if (actionResult !== undefined && pendingTransaction !== undefined) {
            moneyTransferActions.push({
                project: params.transaction.project,
                typeOf: factory.actionType.ConfirmAction,
                object: {
                    pendingTransaction: actionResult.responseBody
                },
                agent: params.transaction.agent,
                recipient: a.recipient,
                amount: {
                    typeOf: 'MonetaryAmount',
                    value: a.object.itemOffered.value,
                    currency: a.object.itemOffered.currency
                },
                fromLocation: fromLocation,
                toLocation: params.transaction.object.toLocation,
                purpose: {
                    typeOf: params.transaction.typeOf,
                    id: params.transaction.id
                },
                ...(typeof a.object.description === 'string') ? { description: a.object.description } : {}
            });
        }
    });

    return moneyTransferActions;
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
