import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import * as factory from '../../../../factory';

export type WebAPIIdentifier = factory.service.webAPI.Identifier;

// tslint:disable-next-line:max-func-body-length
export async function createCancelReservationActions(params: {
    order: factory.order.IOrder;
    returnOrderActionParams?: factory.transaction.returnOrder.IReturnOrderActionParams;
    transaction: factory.transaction.returnOrder.ITransaction;
    // placeOrderTransaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.task.IData<factory.taskName.CancelReservation>[]> {
    const transaction = params.transaction;
    const order = params.order;
    // const placeOrderTransaction = params.placeOrderTransaction;

    const cancelReservationActions: factory.task.IData<factory.taskName.CancelReservation>[] = [];

    let cancelReservationParams: factory.transaction.returnOrder.ICancelReservationParams[] = [];
    const cancelReservation = params.returnOrderActionParams?.potentialActions?.cancelReservation;
    if (Array.isArray(cancelReservation)) {
        cancelReservationParams = cancelReservation;
    }

    const purpose: factory.order.ISimpleOrder = {
        project: order.project,
        typeOf: order.typeOf,
        seller: order.seller,
        customer: order.customer,
        confirmationNumber: order.confirmationNumber,
        orderNumber: order.orderNumber,
        price: order.price,
        priceCurrency: order.priceCurrency,
        orderDate: order.orderDate
    };

    const reservationNumbers: string[] = [];

    // 注文アイテムから取消アクションを作成する
    for (const acceptedOffer of order.acceptedOffers) {
        if (acceptedOffer.itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const reservation = acceptedOffer.itemOffered;
            const reservationNumber = reservation.reservationNumber;

            // 予約番号ごとに取消アクションを作成する
            if (!reservationNumbers.includes(reservationNumber)) {
                let cancelReservationAction: factory.task.IData<factory.taskName.CancelReservation>;

                switch (acceptedOffer.offeredThrough?.identifier) {
                    case factory.service.webAPI.Identifier.COA:
                        const superEventLocationBranchCode = reservation.reservationFor?.superEvent.location.branchCode;
                        const phoneUtil = PhoneNumberUtil.getInstance();
                        const phoneNumber = phoneUtil.parse(order.customer.telephone, 'JP');
                        let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
                        // COAでは数字のみ受け付けるので数字以外を除去
                        telNum = telNum.replace(/[^\d]/g, '');

                        cancelReservationAction = {
                            project: transaction.project,
                            typeOf: factory.actionType.CancelAction,
                            object: {
                                theaterCode: superEventLocationBranchCode,
                                reserveNum: Number(reservationNumber),
                                telNum: telNum
                            },
                            agent: transaction.agent,
                            potentialActions: {},
                            purpose: purpose,
                            instrument: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.COA }
                        };

                        break;

                    default:
                        cancelReservationAction = {
                            project: transaction.project,
                            typeOf: factory.actionType.CancelAction,
                            object: {
                                typeOf: factory.chevre.transactionType.Reserve,
                                transactionNumber: reservationNumber
                            },
                            agent: transaction.agent,
                            potentialActions: {},
                            purpose: purpose,
                            instrument: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre }
                        };

                        const cancelReservationObjectParams = cancelReservationParams.find((p) => {
                            const object
                                = <factory.transaction.returnOrder.ICancelReservationObject<factory.service.webAPI.Identifier.Chevre>>
                                p.object;

                            return object === undefined;
                            // return object === undefined
                            //     || (object?.typeOf === factory.chevre.transactionType.Reserve && object?.id === reserveTransaction.id);
                        });

                        // 予約取消確定後アクションの指定があれば上書き
                        const informReservation
                            = cancelReservationObjectParams?.potentialActions?.cancelReservation?.potentialActions?.informReservation;
                        if (Array.isArray(informReservation)) {
                            cancelReservationAction.potentialActions = {
                                cancelReservation: {
                                    potentialActions: {
                                        informReservation: informReservation
                                    }
                                }
                            };
                        }
                }

                cancelReservationActions.push(cancelReservationAction);
                reservationNumbers.push(reservationNumber);
            }
        }
    }

    // const authorizeSeatReservationActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
    //     placeOrderTransaction.object.authorizeActions
    //         .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
    //         .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

    // for (const authorizeSeatReservationAction of authorizeSeatReservationActions) {
    //     if (authorizeSeatReservationAction.result === undefined) {
    //         throw new factory.errors.NotFound('Result of seat reservation authorize action');
    //     }

    //     let responseBody = authorizeSeatReservationAction.result.responseBody;

    //     if (authorizeSeatReservationAction.instrument === undefined) {
    //         authorizeSeatReservationAction.instrument = {
    //             typeOf: 'WebAPI',
    //             identifier: factory.service.webAPI.Identifier.Chevre
    //         };
    //     }

    //     switch (authorizeSeatReservationAction.instrument.identifier) {
    //         case factory.service.webAPI.Identifier.COA:
    //             // tslint:disable-next-line:max-line-length
    //             responseBody
    //                 = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

    //             const superEventLocationBranchCode = authorizeSeatReservationAction.object.event?.superEvent.location.branchCode;
    //             if (typeof superEventLocationBranchCode === 'string') {
    //                 const phoneUtil = PhoneNumberUtil.getInstance();
    //                 const phoneNumber = phoneUtil.parse(order.customer.telephone, 'JP');
    //                 let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
    //                 // COAでは数字のみ受け付けるので数字以外を除去
    //                 telNum = telNum.replace(/[^\d]/g, '');

    //                 cancelReservationActions.push({
    //                     project: transaction.project,
    //                     typeOf: factory.actionType.CancelAction,
    //                     object: {
    //                         theaterCode: superEventLocationBranchCode,
    //                         reserveNum: Number(responseBody.tmpReserveNum),
    //                         telNum: telNum
    //                     },
    //                     agent: transaction.agent,
    //                     potentialActions: {},
    //                     purpose: purpose,
    //                     instrument: authorizeSeatReservationAction.instrument
    //                 });
    //             }

    //             break;

    //         default:
    //             // tslint:disable-next-line:max-line-length
    //             const reserveTransaction
    // tslint:disable-next-line:max-line-length
    //                 = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

    //             const cancelReservationAction: factory.task.IData<factory.taskName.CancelReservation> = {
    //                 project: transaction.project,
    //                 typeOf: factory.actionType.CancelAction,
    //                 object: {
    //                     typeOf: reserveTransaction.typeOf,
    //                     id: reserveTransaction.id,
    //                     transactionNumber: reserveTransaction.transactionNumber
    //                 },
    //                 agent: transaction.agent,
    //                 potentialActions: {},
    //                 purpose: purpose,
    //                 instrument: authorizeSeatReservationAction.instrument
    //             };

    //             const cancelReservationObjectParams = cancelReservationParams.find((p) => {
    //                 const object = <factory.transaction.returnOrder.ICancelReservationObject<factory.service.webAPI.Identifier.Chevre>>
    //                     p.object;

    //                 return object === undefined
    //                     || (object?.typeOf === factory.chevre.transactionType.Reserve && object?.id === reserveTransaction.id);
    //             });

    //             // 予約取消確定後アクションの指定があれば上書き
    //             const informReservation
    //                 = cancelReservationObjectParams?.potentialActions?.cancelReservation?.potentialActions?.informReservation;
    //             if (Array.isArray(informReservation)) {
    //                 cancelReservationAction.potentialActions = {
    //                     cancelReservation: {
    //                         potentialActions: {
    //                             informReservation: informReservation
    //                         }
    //                     }
    //                 };
    //             }

    //             cancelReservationActions.push(cancelReservationAction);
    //     }
    // }

    return cancelReservationActions;
}
