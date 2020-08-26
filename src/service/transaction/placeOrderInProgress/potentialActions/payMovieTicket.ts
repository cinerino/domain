import * as factory from '../../../../factory';

export async function createPayMovieTicketActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[]> {
    // ムビチケ決済アクション
    const payMovieTicketActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];

    // ムビチケ着券は、注文単位でまとめて実行しないと失敗するので注意
    const authorizeMovieTicketActions =
        (<factory.action.authorize.paymentMethod.movieTicket.IAction[]>params.transaction.object.authorizeActions)
            .filter(
                (a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
                    // tslint:disable-next-line:no-suspicious-comment
                    // TODO 利用可能なムビチケ系統決済方法タイプに対して動的にコーディング
                    && (a.result?.paymentMethod === factory.paymentMethodType.MovieTicket
                        || a.result?.paymentMethod === factory.paymentMethodType.MGTicket)
                    // PaymentDueステータスのアクションのみ、着券アクションをセット
                    // 着券済の場合は、PaymentCompleteステータス
                    && a.result?.paymentStatus === factory.paymentStatusType.PaymentDue
            );

    if (authorizeMovieTicketActions.length > 0) {
        authorizeMovieTicketActions.forEach((a) => {
            const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

            payMovieTicketActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: factory.action.trade.pay.ObjectType.PaymentMethod,
                    paymentMethod: {
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: <factory.paymentMethodType.MovieTicket>result.paymentMethod
                    },
                    movieTickets: a.object.movieTickets
                }],
                agent: params.transaction.agent,
                purpose: {
                    project: params.order.project,
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                },
                ...(typeof a.instrument?.typeOf === 'string') ? { instrument: a.instrument } : undefined
            });
        });
    }

    return payMovieTicketActions;
}
