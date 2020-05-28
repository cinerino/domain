import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import * as factory from '../../../../factory';

export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

// tslint:disable-next-line:max-func-body-length
export async function createCancelReservationActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.returnOrder.IPotentialActionsParams;
    seller: ISeller;
    transaction: factory.transaction.returnOrder.ITransaction;
    placeOrderTransaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.task.IData<factory.taskName.CancelReservation>[]> {
    const transaction = params.transaction;
    const order = params.order;
    const placeOrderTransaction = params.placeOrderTransaction;

    const cancelReservationActions: factory.task.IData<factory.taskName.CancelReservation>[] = [];

    let cancelReservationParams: factory.transaction.returnOrder.ICancelReservationParams[] = [];
    if (params.potentialActions !== undefined
        && params.potentialActions.returnOrder !== undefined
        && params.potentialActions.returnOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.returnOrder.potentialActions.cancelReservation)) {
        cancelReservationParams = params.potentialActions.returnOrder.potentialActions.cancelReservation;
    }

    const authorizeSeatReservationActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
        placeOrderTransaction.object.authorizeActions
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    for (const authorizeSeatReservationAction of authorizeSeatReservationActions) {
        if (authorizeSeatReservationAction.result === undefined) {
            throw new factory.errors.NotFound('Result of seat reservation authorize action');
        }

        let responseBody = authorizeSeatReservationAction.result.responseBody;

        if (authorizeSeatReservationAction.instrument === undefined) {
            authorizeSeatReservationAction.instrument = {
                typeOf: 'WebAPI',
                identifier: factory.service.webAPI.Identifier.Chevre
            };
        }

        switch (authorizeSeatReservationAction.instrument.identifier) {
            case factory.service.webAPI.Identifier.COA:
                // tslint:disable-next-line:max-line-length
                responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                if (authorizeSeatReservationAction.object.event === undefined
                    || authorizeSeatReservationAction.object.event === null) {
                    throw new factory.errors.ServiceUnavailable('Authorized event undefined');
                }
                const superEventLocationBranchCode = authorizeSeatReservationAction.object.event.superEvent.location.branchCode;

                const phoneUtil = PhoneNumberUtil.getInstance();
                const phoneNumber = phoneUtil.parse(order.customer.telephone, 'JP');
                let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
                // COAでは数字のみ受け付けるので数字以外を除去
                telNum = telNum.replace(/[^\d]/g, '');

                cancelReservationActions.push({
                    project: transaction.project,
                    typeOf: factory.actionType.CancelAction,
                    object: {
                        theaterCode: superEventLocationBranchCode,
                        reserveNum: Number(responseBody.tmpReserveNum),
                        telNum: telNum
                    },
                    agent: transaction.agent,
                    potentialActions: {
                    },
                    purpose: {
                        typeOf: order.typeOf,
                        seller: order.seller,
                        customer: order.customer,
                        confirmationNumber: order.confirmationNumber,
                        orderNumber: order.orderNumber,
                        price: order.price,
                        priceCurrency: order.priceCurrency,
                        orderDate: order.orderDate
                    },
                    instrument: authorizeSeatReservationAction.instrument
                });

                break;

            default:
                // tslint:disable-next-line:max-line-length
                const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                const cancelReservationAction: factory.task.IData<factory.taskName.CancelReservation> = {
                    project: transaction.project,
                    typeOf: factory.actionType.CancelAction,
                    object: reserveTransaction,
                    agent: transaction.agent,
                    potentialActions: {},
                    purpose: {
                        typeOf: order.typeOf,
                        seller: order.seller,
                        customer: order.customer,
                        confirmationNumber: order.confirmationNumber,
                        orderNumber: order.orderNumber,
                        price: order.price,
                        priceCurrency: order.priceCurrency,
                        orderDate: order.orderDate
                    },
                    instrument: authorizeSeatReservationAction.instrument
                };

                const cancelReservationObjectParams = cancelReservationParams.find((p) => {
                    // tslint:disable-next-line:max-line-length
                    const object = <factory.transaction.returnOrder.ICancelReservationObject<factory.service.webAPI.Identifier.Chevre>>
                        p.object;

                    return object === undefined
                        || (object !== undefined
                            && object.typeOf === factory.chevre.transactionType.Reserve
                            && object.id === reserveTransaction.id);
                });

                if (cancelReservationObjectParams !== undefined) {
                    // 予約取消確定後アクションの指定があれば上書き
                    if (cancelReservationObjectParams.potentialActions !== undefined
                        && cancelReservationObjectParams.potentialActions.cancelReservation !== undefined
                        && cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions !== undefined
                        && Array.isArray(
                            cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions.informReservation
                        )) {
                        cancelReservationAction.potentialActions = {
                            cancelReservation: {
                                potentialActions: {
                                    // tslint:disable-next-line:max-line-length
                                    informReservation: cancelReservationObjectParams.potentialActions.cancelReservation.potentialActions.informReservation
                                }
                            }
                        };
                    }
                }

                cancelReservationActions.push(cancelReservationAction);
        }
    }

    return cancelReservationActions;
}
