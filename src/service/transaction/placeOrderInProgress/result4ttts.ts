import * as factory from '../../../factory';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;

/**
 * 注文を作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrder(params: {
    project: factory.chevre.project.IProject;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
}): factory.transaction.placeOrder.IResult {
    const seatReservationAuthorizeAction =
        <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .find((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    const authorizeSeatReservationResult =
        <factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>
        seatReservationAuthorizeAction.result;
    const reserveTransaction = authorizeSeatReservationResult.responseBody;
    if (reserveTransaction === undefined) {
        throw new factory.errors.Argument('Transaction', 'Reserve Transaction undefined');
    }

    const seller: factory.order.ISeller = {
        id: params.transaction.seller.id,
        identifier: params.transaction.seller.identifier,
        name: params.transaction.seller.name.ja,
        legalName: params.transaction.seller.legalName,
        typeOf: params.transaction.seller.typeOf,
        telephone: params.transaction.seller.telephone,
        url: params.transaction.seller.url
    };

    const profile = params.transaction.agent;
    const customerIdentifier = (Array.isArray(params.transaction.agent.identifier)) ? params.transaction.agent.identifier : [];
    const customer: factory.order.ICustomer = {
        ...profile,
        id: params.transaction.agent.id,
        typeOf: params.transaction.agent.typeOf,
        name: `${profile.givenName} ${profile.familyName}`,
        url: '',
        identifier: customerIdentifier
    };

    let acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];

    if (Array.isArray(authorizeSeatReservationResult.acceptedOffers)) {
        acceptedOffers = authorizeSeatReservationResult.acceptedOffers;
    }

    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // 決済方法をセット
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.result !== undefined)
                .filter((a) => a.result.paymentMethod === paymentMethodType)
                .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                    const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);
                    paymentMethods.push({
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: paymentMethodType
                    });
                });
        });

    const url = '';

    // 決済方法から注文金額の計算
    let price = 0;
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            price += params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === paymentMethodType)
                .filter((a) => {
                    const totalPaymentDue = (<IAuthorizeAnyPaymentResult>a.result).totalPaymentDue;

                    return totalPaymentDue !== undefined && totalPaymentDue.currency === factory.priceCurrency.JPY;
                })
                .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
        });

    return {
        order: {
            project: params.project,
            typeOf: 'Order',
            seller: seller,
            customer: customer,
            price: price,
            priceCurrency: factory.priceCurrency.JPY,
            paymentMethods: paymentMethods,
            discounts: [],
            confirmationNumber: '',
            orderNumber: '',
            acceptedOffers: acceptedOffers,
            url: url,
            orderStatus: params.orderStatus,
            orderDate: params.orderDate,
            isGift: params.isGift
        }
    };
}
