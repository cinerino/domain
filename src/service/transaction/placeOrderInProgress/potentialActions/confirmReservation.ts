import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import { format } from 'util';

import { factory } from '../../../../factory';

export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;

export async function createConfirmReservationActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[]> {
    // 予約確定アクション
    const confirmReservationActions: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[] = [];

    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // tslint:disable-next-line:max-func-body-length
    seatReservationAuthorizeActions.forEach((a) => {
        const actionResult = a.result;

        if (a.instrument === undefined) {
            a.instrument = {
                typeOf: 'WebAPI',
                identifier: factory.service.webAPI.Identifier.Chevre
            };
        }

        if (actionResult !== undefined) {
            const requestBody = actionResult.requestBody;
            let responseBody = actionResult.responseBody;

            switch (a.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;
                    const price = Number(actionResult.price);
                    const acceptedOffers = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4COA[]>a.object.acceptedOffer;
                    const customer = params.order.customer;

                    const updTmpReserveSeatArgs = requestBody;
                    const updTmpReserveSeatResult = responseBody;

                    // 電話番号のフォーマットを日本人にリーダブルに調整(COAではこのフォーマットで扱うので)
                    const phoneUtil = PhoneNumberUtil.getInstance();
                    const phoneNumber = phoneUtil.parse(customer.telephone, 'JP');
                    let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);

                    // COAでは数字のみ受け付けるので数字以外を除去
                    telNum = telNum.replace(/[^\d]/g, '');

                    const mailAddr = customer.email;
                    if (mailAddr === undefined) {
                        throw new factory.errors.Argument('order', 'order.customer.email undefined');
                    }

                    const updReserveArgs: factory.action.interact.confirm.reservation.IObject4COA = {
                        theaterCode: updTmpReserveSeatArgs.theaterCode,
                        dateJouei: updTmpReserveSeatArgs.dateJouei,
                        titleCode: updTmpReserveSeatArgs.titleCode,
                        titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                        timeBegin: updTmpReserveSeatArgs.timeBegin,
                        tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum,
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveName: format('%s　%s', customer.familyName, customer.givenName),
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveNameJkana: format('%s　%s', customer.familyName, customer.givenName),
                        telNum: telNum,
                        mailAddr: mailAddr,
                        reserveAmount: price, // デフォルトのpriceCurrencyがJPYなのでこれでよし
                        listTicket: acceptedOffers.map((o) => o.ticketInfo)
                    };

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: updReserveArgs,
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
                        instrument: a.instrument
                    });

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                    const confirmReservationObject = createConfirmReservationActionObject({
                        order: params.order,
                        potentialActions: params.potentialActions,
                        transaction: params.transaction,
                        reserveTransaction: reserveTransaction
                    });

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: confirmReservationObject,
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
                        instrument: a.instrument
                    });
            }
        }
    });

    return confirmReservationActions;
}

// tslint:disable-next-line:max-func-body-length
function createConfirmReservationActionObject(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
    reserveTransaction: factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>;
}): factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> {
    let confirmReservationParams
        = params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.confirmReservation;
    if (!Array.isArray(confirmReservationParams)) {
        confirmReservationParams = [];
    }

    const order = params.order;
    const customer = order.customer;
    const paymentMethodNames = order.paymentMethods.map((p) => {
        // return (p.typeOf === factory.paymentMethodType.Others) ? String(p.name) : String(p.typeOf);
        return String(p.typeOf);
    })
        .join(',');

    const defaultUnderNameIdentifiers: factory.propertyValue.IPropertyValue<string>[]
        = [
            ...(Array.isArray(order.identifier)) ? order.identifier : [],
            { name: 'orderNumber', value: order.orderNumber },
            { name: 'transaction', value: params.transaction.id },
            { name: 'paymentMethod', value: paymentMethodNames },
            ...(typeof customer.age === 'string')
                ? [{ name: 'age', value: customer.age }]
                : [],
            ...(Array.isArray(customer.identifier)) ? customer.identifier : [],
            ...(customer.typeOf === factory.personType.Person && typeof customer.memberOf?.membershipNumber === 'string')
                ? [{ name: 'username', value: customer.memberOf.membershipNumber }]
                : []
        ];

    const confirmReservationObject:
        factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> = {
        typeOf: factory.chevre.assetTransactionType.Reserve,
        transactionNumber: params.reserveTransaction.transactionNumber,
        object: {
            reservations: (Array.isArray(params.reserveTransaction.object.reservations))
                ? params.reserveTransaction.object.reservations.map((r) => {
                    // 購入者や販売者の情報を連携する
                    return {
                        id: r.id,
                        additionalProperty: [
                            // { name: 'paymentSeatIndex', value: index.toString() }
                        ],
                        reservedTicket: {
                            issuedBy: {
                                typeOf: order.seller.typeOf,
                                name: (typeof order.seller.name === 'string') ? order.seller.name : String(order.seller.name?.ja)
                            }
                        },
                        underName: {
                            ...<any>order.customer,
                            name: String(params.order.customer.name),
                            identifier: defaultUnderNameIdentifiers
                        }
                    };
                })
                : []
        }
    };

    const confirmReservationObjectParams = confirmReservationParams.find((p) => {
        const object = <factory.action.interact.confirm.reservation.IObject4Chevre>p.object;

        return object?.typeOf === factory.chevre.assetTransactionType.Reserve
            && object?.id === params.reserveTransaction.id;
    });

    // 予約確定パラメータの指定があれば上書きする
    if (confirmReservationObjectParams !== undefined) {
        const customizedConfirmReservationObject =
            <factory.action.interact.confirm.reservation.IObject4Chevre>confirmReservationObjectParams.object;

        // 予約取引確定オブジェクトの指定があれば上書き
        if (customizedConfirmReservationObject.object !== undefined) {
            if (Array.isArray(customizedConfirmReservationObject.object.reservations)) {
                customizedConfirmReservationObject.object.reservations.forEach((r) => {
                    if (Array.isArray(r.underName?.identifier)) {
                        r.underName?.identifier.push(...defaultUnderNameIdentifiers);
                    }

                    if (Array.isArray(r.reservedTicket?.underName?.identifier)) {
                        r.reservedTicket?.underName?.identifier.push(...defaultUnderNameIdentifiers);
                    }
                });
            }

            confirmReservationObject.object = customizedConfirmReservationObject.object;
        }

        // 予約取引確定後アクションの指定があれば上書き
        const informReservationParams
            = customizedConfirmReservationObject.potentialActions?.reserve?.potentialActions?.informReservation;
        if (Array.isArray(informReservationParams)) {
            confirmReservationObject.potentialActions = {
                reserve: {
                    potentialActions: {
                        informReservation: informReservationParams
                    }
                }
            };
        }
    }

    return confirmReservationObject;
}
