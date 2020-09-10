import * as moment from 'moment';

import * as chevre from '../../../chevre';
import * as factory from '../../../factory';

export function creatPayTransactionStartParams(params: {
    object: factory.action.authorize.paymentMethod.any.IObject;
    paymentServiceType: chevre.factory.service.paymentService.PaymentServiceType;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
    transactionNumber: string;
}): chevre.factory.transaction.pay.IStartParamsWithoutDetail {
    const expires = moment(params.transaction.expires)
        .add(1, 'month')
        .toDate(); // 余裕を持って

    return {
        project: { id: params.transaction.project.id, typeOf: chevre.factory.organizationType.Project },
        typeOf: chevre.factory.transactionType.Pay,
        transactionNumber: params.transactionNumber,
        agent: {
            typeOf: params.transaction.agent.typeOf,
            id: params.transaction.agent.id,
            name: (params.transaction.agent.name !== undefined && params.transaction.agent.name !== null)
                ? params.transaction.agent.name
                : params.transaction.agent.id
        },
        recipient: {
            id: params.transaction.seller.id,
            name: params.transaction.seller.name,
            project: { id: params.transaction.project.id, typeOf: chevre.factory.organizationType.Project },
            typeOf: params.transaction.seller.typeOf
        },
        object: {
            typeOf: params.paymentServiceType,
            paymentMethod: {
                typeOf: params.object.paymentMethod,
                amount: params.object.amount,
                additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
                method: params.object.method,
                creditCard: params.object.creditCard,
                movieTickets: params.object.movieTickets,
                name: (typeof params.object.name === 'string') ? params.object.name : params.object.paymentMethod
            }
        },
        expires: expires
    };
}

export function createAuthorizeResult(params: {
    object: factory.action.authorize.paymentMethod.any.IObject;
    paymentServiceType: chevre.factory.service.paymentService.PaymentServiceType;
    payTransaction: chevre.factory.transaction.pay.ITransaction;
}): factory.action.authorize.paymentMethod.any.IResult {
    let totalPaymentDue: chevre.factory.monetaryAmount.IMonetaryAmount;

    switch (params.paymentServiceType) {
        case chevre.factory.service.paymentService.PaymentServiceType.CreditCard:
            totalPaymentDue = {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            };
            break;
        case chevre.factory.service.paymentService.PaymentServiceType.MovieTicket:
            totalPaymentDue = {
                typeOf: 'MonetaryAmount',
                currency: factory.chevre.unitCode.C62,
                value: (Array.isArray(params.object.movieTickets)) ? params.object.movieTickets.length : 0
            };
            break;
        default:
            throw new factory.errors.NotImplemented(`Payment service ${params.paymentServiceType} not implemented`);
    }

    return {
        accountId: (typeof params.payTransaction.object.paymentMethod?.accountId === 'string')
            ? params.payTransaction.object.paymentMethod.accountId
            : '',
        amount: params.object.amount,
        paymentMethod: params.object.paymentMethod,
        paymentStatus: factory.paymentStatusType.PaymentDue,
        paymentMethodId: (typeof params.payTransaction.object.paymentMethod?.paymentMethodId === 'string')
            ? params.payTransaction.object.paymentMethod.paymentMethodId
            : '',
        name: (typeof params.payTransaction.object.paymentMethod?.name === 'string')
            ? params.payTransaction.object.paymentMethod.name
            : params.object.paymentMethod,
        totalPaymentDue: totalPaymentDue,
        additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
        typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
    };
}
