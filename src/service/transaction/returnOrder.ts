/**
 * 注文返品取引サービス
 */
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
// import * as createDebug from 'debug';

import * as emailMessageBuilder from '../../emailMessageBuilder';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
// import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

// const debug = createDebug('cinerino-domain:service');

export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    invoice: InvoiceRepo;
    order: OrderRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type WebAPIIdentifier = factory.service.webAPI.Identifier;

/**
 * 注文返品取引開始
 */
export function start(
    params: factory.transaction.returnOrder.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.returnOrder.ITransaction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        order: OrderRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const seller = await repos.seller.findById({ id: params.seller.id });

        // 返品対象の取引取得
        const order = await repos.order.findByOrderNumber({ orderNumber: params.object.order.orderNumber });

        // 注文ステータスが配送済の場合のみ受け付け
        if (order.orderStatus !== factory.orderStatus.OrderDelivered) {
            throw new factory.errors.Argument('Order Number', `Invalid Order Status: ${order.orderStatus}`);
        }

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [params.object.order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        // 決済がある場合、請求書の状態を検証
        if (order.paymentMethods.length > 0) {
            const invoices = await repos.invoice.search({ referencesOrder: { orderNumbers: [order.orderNumber] } });
            const allPaymentCompleted = invoices.every((invoice) => invoice.paymentStatus === factory.paymentStatusType.PaymentComplete);
            if (!allPaymentCompleted) {
                throw new factory.errors.Argument('order.orderNumber', 'Payment not completed');
            }
        }

        // 検証
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        // if (!params.forcibly) {
        //     validateRequest();
        // }

        const returnOrderAttributes: factory.transaction.IStartParams<factory.transactionType.ReturnOrder> = {
            project: params.project,
            typeOf: factory.transactionType.ReturnOrder,
            agent: params.agent,
            seller: {
                project: params.project,
                id: seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            object: {
                clientUser: params.object.clientUser,
                order: order,
                cancellationFee: params.object.cancellationFee,
                reason: params.object.reason
            },
            expires: params.expires
        };

        let returnOrderTransaction: factory.transaction.returnOrder.ITransaction;
        try {
            returnOrderTransaction = await repos.transaction.start<factory.transactionType.ReturnOrder>(returnOrderAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 同一取引に対して返品取引を作成しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error ...',
                // code: 11000,

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.Argument('Order number', 'Already returned');
                }
            }

            throw error;
        }

        // Chevre予約の場合、予約キャンセル取引開始する？
        // いったん保留中
        const pendingCancelReservationTransactions: factory.chevre.transaction.cancelReservation.ITransaction[] = [];
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

                // 予約キャンセル取引開始は保留

                // pendingCancelReservationTransactions.push(await repos.cancelReservationService.start({
                //     typeOf: factory.chevre.transactionType.CancelReservation,
                //     agent: {
                //         typeOf: returnOrderTransaction.agent.typeOf,
                //         id: returnOrderTransaction.agent.id,
                //         name: order.customer.name
                //     },
                //     object: {
                //         transaction: {
                //             typeOf: responseBody.typeOf,
                //             id: responseBody.id
                //         }
                //     },
                //     expires: moment(params.expires)
                //         .add(1, 'month')
                //         .toDate() // 余裕を持って
                // }));
            }
        }

        await repos.transaction.transactionModel.findByIdAndUpdate(
            returnOrderTransaction.id,
            { 'object.pendingCancelReservationTransactions': pendingCancelReservationTransactions }
        )
            .exec();

        return returnOrderTransaction;
    };
}

/**
 * 取引確定
 */
export function confirm(params: factory.transaction.returnOrder.IConfirmParams) {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        seller: SellerRepo;
    }) => {
        let transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transaction', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transaction', 'Transaction already canceled');
        }

        if (params.agent !== undefined && params.agent.id !== undefined) {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        const order = transaction.object.order;
        const seller = await repos.seller.findById(
            { id: order.seller.id },
            { paymentAccepted: 0 } // 決済情報は不要
        );

        const placeOrderTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            limit: 1,
            typeOf: factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [order.orderNumber] }
            }
        });
        const placeOrderTransaction = placeOrderTransactions.shift();
        if (placeOrderTransaction === undefined) {
            throw new factory.errors.NotFound('Transaction');
        }

        const actionsOnOrder = await repos.action.searchByOrderNumber({ orderNumber: order.orderNumber });
        const payActions = <factory.action.trade.pay.IAction<factory.paymentMethodType>[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.PayAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus);

        // クレジットカード返金アクション
        const refundCreditCardActions =
            await Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>[]>payActions)
                .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.CreditCard)
                .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.CreditCard>> => {
                    // Eメールカスタマイズの指定を確認
                    let emailCustomization: factory.creativeWork.message.email.ICustomization | undefined;

                    const refundCreditCardActionParams = (params.potentialActions !== undefined
                        && params.potentialActions.returnOrder !== undefined
                        && params.potentialActions.returnOrder.potentialActions !== undefined
                        && params.potentialActions.returnOrder.potentialActions.refundCreditCard !== undefined)
                        ? params.potentialActions.returnOrder.potentialActions.refundCreditCard
                        : undefined;
                    if (refundCreditCardActionParams !== undefined) {
                        const assignedRefundCreditCardAction = refundCreditCardActionParams.find((refundCreditCardAction) => {
                            const assignedPaymentMethod = refundCreditCardAction.object.object.find((paymentMethod) => {
                                return paymentMethod.paymentMethod.paymentMethodId === a.object[0].paymentMethod.paymentMethodId;
                            });

                            return assignedPaymentMethod !== undefined;
                        });

                        if (assignedRefundCreditCardAction !== undefined
                            && assignedRefundCreditCardAction.potentialActions !== undefined
                            && assignedRefundCreditCardAction.potentialActions.sendEmailMessage !== undefined
                            && assignedRefundCreditCardAction.potentialActions.sendEmailMessage.object !== undefined) {
                            emailCustomization = assignedRefundCreditCardAction.potentialActions.sendEmailMessage.object;
                        }
                    }

                    const emailMessage = await emailMessageBuilder.createRefundMessage({
                        order,
                        paymentMethods: a.object.map((o) => o.paymentMethod),
                        email: emailCustomization
                    });
                    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                        project: transaction.project,
                        typeOf: factory.actionType.SendAction,
                        object: emailMessage,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
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
                        }
                    };

                    return {
                        project: transaction.project,
                        typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                        object: a,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
                        purpose: {
                            project: transaction.project,
                            typeOf: order.typeOf,
                            seller: order.seller,
                            customer: order.customer,
                            confirmationNumber: order.confirmationNumber,
                            orderNumber: order.orderNumber,
                            price: order.price,
                            priceCurrency: order.priceCurrency,
                            orderDate: order.orderDate
                        },
                        potentialActions: {
                            sendEmailMessage: [sendEmailMessageActionAttributes]
                        }
                    };
                }));

        // 口座返金アクション
        const refundAccountActions =
            await Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.Account>[]>payActions)
                .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.Account)
                .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.Account>> => {
                    const emailMessage = await emailMessageBuilder.createRefundMessage({
                        order,
                        paymentMethods: a.object.map((o) => o.paymentMethod)
                    });
                    const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                        project: transaction.project,
                        typeOf: factory.actionType.SendAction,
                        object: emailMessage,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
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
                        }
                    };

                    return {
                        project: transaction.project,
                        typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                        object: a,
                        agent: {
                            project: transaction.project,
                            typeOf: seller.typeOf,
                            id: seller.id,
                            name: seller.name,
                            url: seller.url
                        },
                        recipient: order.customer,
                        purpose: {
                            project: transaction.project,
                            typeOf: order.typeOf,
                            seller: order.seller,
                            customer: order.customer,
                            confirmationNumber: order.confirmationNumber,
                            orderNumber: order.orderNumber,
                            price: order.price,
                            priceCurrency: order.priceCurrency,
                            orderDate: order.orderDate
                        },
                        potentialActions: {
                            sendEmailMessage: [sendEmailMessageActionAttributes]
                        }
                    };
                }));

        // ムビチケ着券返金アクション
        let refundMovieTicketActions: factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
        const refundMovieTicket = params.potentialActions !== undefined
            && params.potentialActions.returnOrder !== undefined
            && params.potentialActions.returnOrder.potentialActions !== undefined
            && params.potentialActions.returnOrder.potentialActions.refundMovieTicket === true;
        if (refundMovieTicket) {
            refundMovieTicketActions =
                await Promise.all((<factory.action.trade.pay.IAction<factory.paymentMethodType.MovieTicket>[]>payActions)
                    .filter((a) => a.object[0].paymentMethod.typeOf === factory.paymentMethodType.MovieTicket)
                    .map(async (a): Promise<factory.action.trade.refund.IAttributes<factory.paymentMethodType.MovieTicket>> => {
                        const emailMessage = await emailMessageBuilder.createRefundMessage({
                            order,
                            paymentMethods: a.object.map((o) => o.paymentMethod)
                        });
                        const sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes = {
                            project: transaction.project,
                            typeOf: factory.actionType.SendAction,
                            object: emailMessage,
                            agent: {
                                project: transaction.project,
                                typeOf: seller.typeOf,
                                id: seller.id,
                                name: seller.name,
                                url: seller.url
                            },
                            recipient: order.customer,
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
                            }
                        };

                        return {
                            project: transaction.project,
                            typeOf: <factory.actionType.RefundAction>factory.actionType.RefundAction,
                            object: a,
                            agent: {
                                project: transaction.project,
                                typeOf: seller.typeOf,
                                id: seller.id,
                                name: seller.name,
                                url: seller.url
                            },
                            recipient: order.customer,
                            purpose: {
                                project: transaction.project,
                                typeOf: order.typeOf,
                                seller: order.seller,
                                customer: order.customer,
                                confirmationNumber: order.confirmationNumber,
                                orderNumber: order.orderNumber,
                                price: order.price,
                                priceCurrency: order.priceCurrency,
                                orderDate: order.orderDate
                            },
                            potentialActions: {
                                sendEmailMessage: [sendEmailMessageActionAttributes]
                            }
                        };
                    }));
        }

        // ポイントインセンティブの数だけ、返却アクションを作成
        const givePointActions = <factory.action.transfer.give.pointAward.IAction[]>actionsOnOrder
            .filter((a) => a.typeOf === factory.actionType.GiveAction)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.transfer.give.pointAward.ObjectType.PointAward);
        const returnPointAwardActions = givePointActions.map(
            (a): factory.action.transfer.returnAction.pointAward.IAttributes => {
                return {
                    project: transaction.project,
                    typeOf: factory.actionType.ReturnAction,
                    object: a,
                    agent: order.customer,
                    recipient: {
                        project: transaction.project,
                        typeOf: seller.typeOf,
                        id: seller.id,
                        name: seller.name,
                        url: seller.url
                    },
                    potentialActions: {}
                };
            }
        );

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
                        const object =
                            <factory.transaction.returnOrder.ICancelReservationObject<factory.service.webAPI.Identifier.Chevre>>p.object;

                        return object !== undefined
                            && object.typeOf === factory.chevre.transactionType.Reserve
                            && object.id === reserveTransaction.id;
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

        const informOrderActionsOnReturn: factory.action.interact.inform.IAttributes<any, any>[] = [];
        if (params.potentialActions !== undefined) {
            if (params.potentialActions.returnOrder !== undefined) {
                if (params.potentialActions.returnOrder.potentialActions !== undefined) {
                    if (Array.isArray(params.potentialActions.returnOrder.potentialActions.informOrder)) {
                        params.potentialActions.returnOrder.potentialActions.informOrder.forEach((a) => {
                            if (a.recipient !== undefined) {
                                if (typeof a.recipient.url === 'string') {
                                    informOrderActionsOnReturn.push({
                                        agent: transaction.seller,
                                        object: order,
                                        project: transaction.project,
                                        // purpose: params.transaction,
                                        recipient: {
                                            id: transaction.agent.id,
                                            name: transaction.agent.name,
                                            typeOf: transaction.agent.typeOf,
                                            url: a.recipient.url
                                        },
                                        typeOf: factory.actionType.InformAction
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }

        const returnOrderActionAttributes: factory.action.transfer.returnAction.order.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.ReturnAction,
            object: {
                project: transaction.project,
                typeOf: order.typeOf,
                seller: order.seller,
                customer: order.customer,
                confirmationNumber: order.confirmationNumber,
                orderNumber: order.orderNumber,
                price: order.price,
                priceCurrency: order.priceCurrency,
                orderDate: order.orderDate
            },
            agent: order.customer,
            recipient: seller,
            potentialActions: {
                cancelReservation: cancelReservationActions,
                informOrder: informOrderActionsOnReturn,
                refundCreditCard: refundCreditCardActions,
                refundAccount: refundAccountActions,
                refundMovieTicket: refundMovieTicketActions,
                returnPointAward: returnPointAwardActions
            }
        };
        const result: factory.transaction.returnOrder.IResult = {
        };
        const potentialActions: factory.transaction.returnOrder.IPotentialActions = {
            returnOrder: returnOrderActionAttributes
        };

        // ステータス変更
        transaction = await repos.transaction.confirm({
            typeOf: transaction.typeOf,
            id: transaction.id,
            authorizeActions: [],
            result: result,
            potentialActions: potentialActions
        });

        return transaction.result;
    };
}

/**
 * 返品取引バリデーション
 */
export function validateRequest() {
    // 現時点で特にバリデーション内容なし
}

/**
 * 返品取引のタスクをエクスポートする
 */
export function exportTasks(params: {
    project?: factory.project.IProject;
    status: factory.transactionStatusType;
}) {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: factory.transactionType.ReturnOrder,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        const tasks = await exportTasksById(transaction)(repos);
        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}

/**
 * 取引のタスクを出力します
 * 複数タスクが生成されます
 * この関数では、取引のタスクエクスポートステータスは見ません
 */
export function exportTasksById(params: { id: string }): ITaskAndTransactionOperation<factory.task.ITask<factory.taskName>[]> {
    return async (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById({ typeOf: factory.transactionType.ReturnOrder, id: params.id });
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];
        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                // 注文返品タスク
                const returnOrderTask: factory.task.IAttributes<factory.taskName.ReturnOrder> = {
                    project: transaction.project,
                    name: factory.taskName.ReturnOrder,
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        project: transaction.project,
                        orderNumber: transaction.object.order.orderNumber
                    }
                };
                taskAttributes.push(returnOrderTask);
                break;

            case factory.transactionStatusType.Expired:
                // 特にタスクなし
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }

        return Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
