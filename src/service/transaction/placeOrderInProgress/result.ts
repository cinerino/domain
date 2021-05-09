import * as moment from 'moment-timezone';

import { factory } from '../../../factory';

import { createMoneyTransferAcceptedOffers, createProductItems, createReservationAcceptedOffers } from './result/acceptedOffers';

export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult;

/**
 * 注文を生成する
 */
export function createOrder(params: {
    orderNumber: string;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
}): factory.order.IOrder {
    const seller = createSeller({ transaction: params.transaction });
    const customer = createCustomer({ transaction: params.transaction });
    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];

    // 座席予約がある場合
    acceptedOffers.push(...createReservationAcceptedOffers(params));

    // 通貨転送がある場合
    acceptedOffers.push(...createMoneyTransferAcceptedOffers({ ...params, seller: seller }));

    // Chevreプロダクトがある場合
    acceptedOffers.push(...createProductItems({ ...params }));

    // 決済方法をセット
    const { paymentMethods, price } = createPaymentMethods({ transaction: params.transaction });

    const discounts: factory.order.IDiscount[] = [];

    const name: string | undefined =
        (typeof params.transaction.object.name === 'string') ? params.transaction.object.name : undefined;

    const broker: factory.order.IBroker | undefined =
        (typeof params.transaction.object.broker?.typeOf === 'string') ? params.transaction.object.broker : undefined;

    return {
        project: params.transaction.project,
        typeOf: factory.order.OrderType.Order,
        seller: seller,
        customer: customer,
        price: price,
        priceCurrency: factory.priceCurrency.JPY,
        paymentMethods: paymentMethods,
        discounts: discounts,
        confirmationNumber: '',
        orderNumber: params.orderNumber,
        acceptedOffers: acceptedOffers,
        url: '',
        orderStatus: params.orderStatus,
        orderDate: params.orderDate,
        identifier: [],
        isGift: params.isGift,
        ...(typeof name === 'string') ? { name } : undefined,
        ...(typeof broker?.typeOf === 'string') ? { broker } : undefined
    };
}

function createSeller(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.ISeller {
    const seller = params.transaction.seller;

    return {
        project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
        id: seller.id,
        name: (typeof seller.name === 'string')
            ? seller.name
            : String(seller.name?.ja),
        // legalName: seller.legalName,
        typeOf: seller.typeOf,
        ...(typeof seller.telephone === 'string') ? { telephone: seller.telephone } : undefined,
        ...(typeof seller.url === 'string') ? { url: seller.url } : undefined
    };
}

function createCustomer(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): factory.order.ICustomer {
    // const profile = params.transaction.agent;
    // const customerByTransaction = params.transaction.object.customer;

    // return {
    //     ...profile,
    //     identifier: (Array.isArray(profile.identifier)) ? profile.identifier : [],
    //     name: (typeof profile.name === 'string') ? profile.name : `${profile.givenName} ${profile.familyName}`,
    //     ...(typeof profile.url === 'string') ? { url: profile.url } : undefined,
    //     // transaction.object.customerが存在すれば適用する
    //     // transaction.object.customerはstart時点でapiが自動的に指定、あるいは、その後クライアントから変更されるか
    //     ...(typeof customerByTransaction?.typeOf === 'string') ? { typeOf: customerByTransaction.typeOf } : undefined,
    //     ...(typeof customerByTransaction?.id === 'string') ? { id: customerByTransaction.id } : undefined
    // };

    // transaction.object.customerはstart時点でapiが自動的に指定、あるいは、その後クライアントから変更されるか
    const customerByTransaction = params.transaction.object.customer;
    if (typeof customerByTransaction?.id !== 'string') {
        throw new factory.errors.Argument('transaction', 'object.customer.id undefined');
    }
    if (typeof customerByTransaction?.typeOf !== 'string') {
        throw new factory.errors.Argument('transaction', 'object.customer.typeOf undefined');
    }

    return {
        ...customerByTransaction,
        identifier: (Array.isArray(customerByTransaction.identifier)) ? customerByTransaction.identifier : [],
        name: (typeof customerByTransaction.name === 'string') ? customerByTransaction.name : `${customerByTransaction.givenName} ${customerByTransaction.familyName}`
    };
}

function createPaymentMethods(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
}): {
    paymentMethods: factory.order.IPaymentMethod[];
    price: number;
} {
    const paymentMethods: factory.order.IPaymentMethod[] = [];
    let price = 0;

    const authorizePaymentActions = (<factory.action.authorize.paymentMethod.any.IAction[]>
        params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus
            && a.result?.typeOf === factory.action.authorize.paymentMethod.any.ResultType.Payment);

    // 決済方法をセット
    authorizePaymentActions.forEach((a) => {
        const result = (<factory.action.authorize.paymentMethod.any.IResult>a.result);
        paymentMethods.push({
            accountId: result.accountId,
            additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
            name: result.name,
            paymentMethodId: result.paymentMethodId,
            totalPaymentDue: result.totalPaymentDue,
            typeOf: <any>result.paymentMethod
        });
    });

    // 決済方法から注文金額の計算
    price += authorizePaymentActions
        .filter((a) => {
            return a.result?.totalPaymentDue?.currency === factory.priceCurrency.JPY;
        })
        .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);

    return { paymentMethods, price };
}

export function createConfirmationNumber4identifier(params: {
    confirmationNumber: string;
    order: factory.order.IOrder;
}) {
    let eventStartDateStr = moment(params.order.orderDate)
        .tz('Asia/Tokyo')
        .format('YYYYMMDD');
    if (Array.isArray(params.order.acceptedOffers) && params.order.acceptedOffers.length > 0) {
        const firstAcceptedOffer = params.order.acceptedOffers[0];
        const itemOffered = <factory.order.IReservation>firstAcceptedOffer.itemOffered;
        if (itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const event = itemOffered.reservationFor;
            eventStartDateStr = moment(event.startDate)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD');
        }
    }
    const confirmationNumber4identifier = `${eventStartDateStr}${params.confirmationNumber}`;
    const telephone = params.order.customer?.telephone;
    const confirmationPass = (typeof telephone === 'string')
        // tslint:disable-next-line:no-magic-numbers
        ? telephone.slice(-4)
        : '9999';

    return { confirmationNumber4identifier, confirmationPass };
}
