/**
 * 注文サービス
 */
import * as createDebug from 'debug';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment';

import * as chevre from '../chevre';
import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as InvoiceRepo } from '../repo/invoice';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as COA from '../coa';

const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

/**
 * 注文取引から注文を作成する
 */
export function placeOrder(params: factory.action.trade.order.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const order = params.object;
        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            result: { order: { orderNumbers: [order.orderNumber] } }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        // アクション開始
        const orderActionAttributes = params;
        const action = await repos.action.start(orderActionAttributes);

        try {
            // 注文保管
            await repos.order.createIfNotExist(order);

            // 請求書作成
            const invoices: factory.invoice.IInvoice[] = [];
            Object.keys(factory.paymentMethodType)
                .forEach((key) => {
                    const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
                    placeOrderTransaction.object.authorizeActions
                        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                        .filter((a) => a.result !== undefined)
                        .filter((a) => a.result.paymentMethod === paymentMethodType)
                        .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                            const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);

                            // 決済方法と決済IDごとに金額をまとめて請求書を作成する
                            const existingInvoiceIndex = invoices.findIndex((i) => {
                                return i.paymentMethod === paymentMethodType && i.paymentMethodId === result.paymentMethodId;
                            });

                            if (existingInvoiceIndex < 0) {
                                invoices.push({
                                    typeOf: 'Invoice',
                                    accountId: result.accountId,
                                    confirmationNumber: order.confirmationNumber.toString(),
                                    customer: order.customer,
                                    paymentMethod: paymentMethodType,
                                    paymentMethodId: result.paymentMethodId,
                                    paymentStatus: result.paymentStatus,
                                    referencesOrder: order,
                                    totalPaymentDue: result.totalPaymentDue
                                });
                            } else {
                                const existingInvoice = invoices[existingInvoiceIndex];
                                if (
                                    existingInvoice.totalPaymentDue !== undefined
                                    && existingInvoice.totalPaymentDue.value !== undefined
                                    && result.totalPaymentDue !== undefined
                                    && result.totalPaymentDue.value !== undefined
                                ) {
                                    existingInvoice.totalPaymentDue.value += result.totalPaymentDue.value;
                                }
                            }
                        });
                });

            await Promise.all(invoices.map(async (invoice) => {
                await repos.invoice.createIfNotExist(invoice);
            }));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: orderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: orderActionAttributes.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onPlaceOrder(orderActionAttributes)(repos);
    };
}

/**
 * 注文作成後のアクション
 */
function onPlaceOrder(orderActionAttributes: factory.action.trade.order.IAttributes) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
    }) => {
        const orderPotentialActions = orderActionAttributes.potentialActions;
        const now = new Date();

        // potentialActionsのためのタスクを生成
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (orderPotentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (orderPotentialActions.sendOrder !== undefined) {
                const sendOrderTask: factory.task.IAttributes<factory.taskName.SendOrder> = {
                    name: factory.taskName.SendOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: now, // なるはやで実行
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: orderPotentialActions.sendOrder
                };
                taskAttributes.push(sendOrderTask);
            }

            // 予約確定
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.confirmReservation)) {
                taskAttributes.push(...orderPotentialActions.confirmReservation.map(
                    (a): factory.task.IAttributes<factory.taskName.ConfirmReservation> => {
                        return {
                            name: factory.taskName.ConfirmReservation,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // クレジットカード決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payCreditCard)) {
                taskAttributes.push(...orderPotentialActions.payCreditCard.map(
                    (a): factory.task.IAttributes<factory.taskName.PayCreditCard> => {
                        return {
                            name: factory.taskName.PayCreditCard,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // 口座決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payAccount)) {
                taskAttributes.push(...orderPotentialActions.payAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.PayAccount> => {
                        return {
                            name: factory.taskName.PayAccount,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // ムビチケ決済
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.payMovieTicket)) {
                taskAttributes.push(...orderPotentialActions.payMovieTicket.map(
                    (a): factory.task.IAttributes<factory.taskName.PayMovieTicket> => {
                        return {
                            name: factory.taskName.PayMovieTicket,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // ポイント付与
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(orderPotentialActions.givePointAward)) {
                taskAttributes.push(...orderPotentialActions.givePointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.GivePointAward> => {
                        return {
                            name: factory.taskName.GivePointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}

/**
 * 注文返品アクション
 */
export function returnOrder(params: { orderNumber: string }) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        ownershipInfo: OwnershipInfoRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
        cancelReservationService?: chevre.service.transaction.CancelReservation;
    }) => {
        // 確定済の注文返品取引がひとつあるはず
        const returnOrderTransactions = await repos.transaction.search<factory.transactionType.ReturnOrder>({
            limit: 1,
            typeOf: factory.transactionType.ReturnOrder,
            object: {
                order: { orderNumbers: [params.orderNumber] }
            },
            statuses: [factory.transactionStatusType.Confirmed]
        });
        const returnOrderTransaction = returnOrderTransactions.shift();
        if (returnOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Return order transaction');
        }
        const potentialActions = returnOrderTransaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('PotentialActions of return order transaction');
        }

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [returnOrderTransaction.object.order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Place Order Transaction');
        }

        // アクション開始
        const cancelReservationService = repos.cancelReservationService;
        const returnOrderActionAttributes = potentialActions.returnOrder;
        const action = await repos.action.start(returnOrderActionAttributes);
        try {
            const order = returnOrderTransaction.object.order;

            // 直列で実行しないとCOAの予約取消に失敗する可能性ありなので要注意
            for (const acceptedOffer of order.acceptedOffers) {
                const itemOffered = acceptedOffer.itemOffered;

                // 座席予約の場合キャンセル
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
                    const reservation = itemOffered;

                    // COAで予約の場合予約取消
                    if (acceptedOffer.offeredThrough !== undefined
                        && acceptedOffer.offeredThrough.identifier === factory.service.webAPI.Identifier.COA) {
                        const superEventLocationBranchCode = reservation.reservationFor.superEvent.location.branchCode;

                        const phoneUtil = PhoneNumberUtil.getInstance();
                        const phoneNumber = phoneUtil.parse(order.customer.telephone, 'JP');
                        let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
                        // COAでは数字のみ受け付けるので数字以外を除去
                        telNum = telNum.replace(/[^\d]/g, '');
                        const stateReserveResult = await COA.services.reserve.stateReserve({
                            theaterCode: superEventLocationBranchCode,
                            reserveNum: Number(reservation.reservationNumber),
                            telNum: telNum
                        });
                        debug('COA stateReserveResult is', stateReserveResult);

                        if (stateReserveResult !== null) {
                            debug('deleting COA reservation...');
                            await COA.services.reserve.delReserve({
                                theaterCode: superEventLocationBranchCode,
                                reserveNum: Number(reservation.reservationNumber),
                                telNum: telNum,
                                dateJouei: stateReserveResult.dateJouei,
                                titleCode: stateReserveResult.titleCode,
                                titleBranchNum: stateReserveResult.titleBranchNum,
                                timeBegin: stateReserveResult.timeBegin,
                                listSeat: stateReserveResult.listTicket
                            });
                            debug('COA delReserve processed.');
                        }
                    }
                }
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

                        // no op

                        break;

                    default:
                        // tslint:disable-next-line:max-line-length
                        responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                        if (cancelReservationService !== undefined) {
                            const cancelReservationTransaction = await cancelReservationService.start({
                                typeOf: factory.chevre.transactionType.CancelReservation,
                                agent: {
                                    typeOf: returnOrderTransaction.agent.typeOf,
                                    id: returnOrderTransaction.agent.id,
                                    name: String(order.customer.name)
                                },
                                object: {
                                    transaction: {
                                        typeOf: responseBody.typeOf,
                                        id: responseBody.id
                                    }
                                },
                                expires: moment(returnOrderTransaction.expires)
                                    // tslint:disable-next-line:no-magic-numbers
                                    .add(5, 'minutes')
                                    .toDate()
                            });

                            await cancelReservationService.confirm(cancelReservationTransaction);
                        }
                }
            }

            // 予約キャンセル確定
            const cancelReservationTransactions = returnOrderTransaction.object.pendingCancelReservationTransactions;
            if (cancelReservationTransactions !== undefined && cancelReservationService !== undefined) {
                await Promise.all(cancelReservationTransactions.map(async (cancelReservationTransaction) => {
                    await cancelReservationService.confirm({ id: cancelReservationTransaction.id });
                }));
            }

            // 注文ステータス変更
            debug('changing orderStatus...');
            await repos.order.returnOrder({
                orderNumber: order.orderNumber,
                dateReturned: new Date()
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: returnOrderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete({ typeOf: returnOrderActionAttributes.typeOf, id: action.id, result: {} });

        // 潜在アクション
        await onReturn(returnOrderActionAttributes)({ task: repos.task });
    };
}

/**
 * 返品アクション後の処理
 * 注文返品後に何をすべきかは返品アクションのpotentialActionsとして定義されているはずなので、それらをタスクとして登録します。
 */
export function onReturn(returnActionAttributes: factory.action.transfer.returnAction.order.IAttributes) {
    return async (repos: {
        task: TaskRepo;
    }) => {
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (returnActionAttributes.potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(returnActionAttributes.potentialActions.refundCreditCard)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.refundCreditCard.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundCreditCard> => {
                        return {
                            name: factory.taskName.RefundCreditCard,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // 口座返金タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(returnActionAttributes.potentialActions.refundAccount)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.refundAccount.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundAccount> => {
                        return {
                            name: factory.taskName.RefundAccount,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // 口座返金タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(returnActionAttributes.potentialActions.refundMovieTicket)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.refundMovieTicket.map(
                    (a): factory.task.IAttributes<factory.taskName.RefundMovieTicket> => {
                        return {
                            name: factory.taskName.RefundMovieTicket,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }

            // Pecorinoインセンティブ返却タスク
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(returnActionAttributes.potentialActions.returnPointAward)) {
                taskAttributes.push(...returnActionAttributes.potentialActions.returnPointAward.map(
                    (a): factory.task.IAttributes<factory.taskName.ReturnPointAward> => {
                        return {
                            name: factory.taskName.ReturnPointAward,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }
                ));
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
