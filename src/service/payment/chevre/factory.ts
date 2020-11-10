import * as moment from 'moment';

import * as chevre from '../../../chevre';
import * as factory from '../../../factory';

export function creatPayTransactionStartParams(params: {
    object: factory.action.authorize.paymentMethod.any.IObject;
    paymentServiceType: chevre.factory.service.paymentService.PaymentServiceType;
    transaction: factory.transaction.ITransaction<factory.transactionType>;
    transactionNumber: string;
    confirmationNumber?: string;
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
                creditCard: params.object.creditCard,
                movieTickets: params.object.movieTickets,
                ...(typeof params.object.method === 'string') ? { method: params.object.method } : undefined,
                ...(typeof params.object.name === 'string') ? { name: params.object.name } : undefined,
                ...(typeof params.object.accountId === 'string') ? { accountId: params.object.accountId } : undefined,
                ...(typeof params.object.description === 'string') ? { description: params.object.description } : undefined
            }
        },
        expires: expires,
        ...(typeof params.confirmationNumber === 'string')
            ? { purpose: { confirmationNumber: params.confirmationNumber } }
            : undefined
    };
}

export function createAuthorizeResult(params: {
    object: factory.action.authorize.paymentMethod.any.IObject;
    paymentServiceType: chevre.factory.service.paymentService.PaymentServiceType;
    payTransaction: chevre.factory.transaction.pay.ITransaction;
}): factory.action.authorize.paymentMethod.any.IResult {
    const totalPaymentDue = params.payTransaction.object.paymentMethod?.totalPaymentDue;
    if (typeof totalPaymentDue?.typeOf !== 'string') {
        throw new factory.errors.ServiceUnavailable('payTransaction.object.paymentMethod.totalPaymentDue undefined');
    }

    // switch (params.paymentServiceType) {
    //     case chevre.factory.service.paymentService.PaymentServiceType.CreditCard:
    //         totalPaymentDue = {
    //             typeOf: 'MonetaryAmount',
    //             currency: factory.priceCurrency.JPY,
    //             value: params.object.amount
    //         };
    //         break;
    //     case chevre.factory.service.paymentService.PaymentServiceType.MovieTicket:
    //         totalPaymentDue = {
    //             typeOf: 'MonetaryAmount',
    //             currency: factory.chevre.unitCode.C62,
    //             value: (Array.isArray(params.object.movieTickets)) ? params.object.movieTickets.length : 0
    //         };
    //         break;
    //     default:
    //         throw new factory.errors.NotImplemented(`Payment service ${params.paymentServiceType} not implemented`);
    // }

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
