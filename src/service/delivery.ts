/**
 * 配送サービス
 * ここでいう「配送」とは、「エンドユーザーが取得した所有権を利用可能な状態にすること」を指します。
 * つまり、物理的なモノの配送だけに限らず、
 * 座席予約で言えば、入場可能、つまり、QRコードが所有権として発行されること
 * ポイントインセンティブで言えば、口座に振り込まれること
 * などが配送処理として考えられます。
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as factory from '@cinerino/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as uuid from 'uuid';
// import * as util from 'util';

import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

const debug = createDebug('cinerino-domain:service');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 注文を配送する
 * COAに本予約連携を行い、内部的には所有権を作成する
 * @param transactionId 注文取引ID
 */
export function sendOrder(transactionId: string) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        ownershipInfo: OwnershipInfoRepo;
        transaction: TransactionRepo;
        task: TaskRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        const transaction = await repos.transaction.findById(factory.transactionType.PlaceOrder, transactionId);
        const transactionResult = transaction.result;
        if (transactionResult === undefined) {
            throw new factory.errors.NotFound('transaction.result');
        }
        const potentialActions = transaction.potentialActions;
        if (potentialActions === undefined) {
            throw new factory.errors.NotFound('transaction.potentialActions');
        }

        const seatReservationAuthorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>
            transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
        // if (authorizeActions.length !== 1) {
        //     throw new factory.errors.NotImplemented('Number of seat reservation authorizeAction must be 1.');
        // }

        const customerContact = transaction.object.customerContact;
        if (customerContact === undefined) {
            throw new factory.errors.NotFound('transaction.object.customerContact');
        }
        const orderPotentialActions = potentialActions.order.potentialActions;
        if (orderPotentialActions === undefined) {
            throw new factory.errors.NotFound('order.potentialActions');
        }

        // アクション開始
        const sendOrderActionAttributes = orderPotentialActions.sendOrder;
        const action = await repos.action.start(sendOrderActionAttributes);

        try {
            // 座席予約確定
            const seatReservationAuthorizeAction = seatReservationAuthorizeActions.shift();
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (seatReservationAuthorizeAction !== undefined) {
                const seatReservationAuthorizeActionResult = seatReservationAuthorizeAction.result;
                if (seatReservationAuthorizeActionResult === undefined) {
                    throw new factory.errors.NotFound('authorizeAction.result');
                }

                await repos.reserveService.confirm({ transactionId: seatReservationAuthorizeActionResult.responseBody.id });
            }

            // 所有権作成
            const ownershipInfos = createOwnershipInfosFromTransaction({
                transaction: transaction,
                order: transactionResult.order
            });
            await Promise.all(ownershipInfos.map(async (ownershipInfo) => {
                await repos.ownershipInfo.save(ownershipInfo);
            }));

            // 注文ステータス変更
            await repos.order.changeStatus(transactionResult.order.orderNumber, factory.orderStatus.OrderDelivered);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(sendOrderActionAttributes.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        await repos.action.complete(sendOrderActionAttributes.typeOf, action.id, {});

        // 潜在アクション
        await onSend(sendOrderActionAttributes)({ task: repos.task });
    };
}

/**
 * 取引から所有権を作成する
 */
export function createOwnershipInfosFromTransaction(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
}): factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>[] {
    return params.order.acceptedOffers.map((acceptedOffer) => {
        const itemOffered = acceptedOffer.itemOffered;
        let ownershipInfo: factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;
        const ownedFrom = params.order.orderDate;
        let ownedThrough: Date;

        switch (itemOffered.typeOf) {
            case factory.chevre.reservationType.EventReservation:
                // イベント予約に対する所有権の有効期限はイベント終了日時までで十分だろう
                // 現時点では所有権対象がイベント予約のみなので、これで問題ないが、
                // 対象が他に広がれば、有効期間のコントロールは別でしっかり行う必要があるだろう
                ownedThrough = itemOffered.reservationFor.endDate;
                ownershipInfo = {
                    typeOf: <factory.ownershipInfo.OwnershipInfoType>'OwnershipInfo',
                    id: uuid.v4(),
                    ownedBy: params.transaction.agent,
                    acquiredFrom: params.transaction.seller,
                    ownedFrom: ownedFrom,
                    ownedThrough: ownedThrough,
                    typeOfGood: {
                        typeOf: itemOffered.typeOf,
                        id: itemOffered.id,
                        reservationNumber: itemOffered.reservationNumber
                    }
                };

                break;

            default:
                throw new factory.errors.NotImplemented(`Offered item type ${(<any>itemOffered).typeOf} not implemented`);
        }

        return ownershipInfo;
    });
}

/**
 * 注文配送後のアクション
 * @param transactionId 注文取引ID
 * @param sendOrderActionAttributes 注文配送悪損属性
 */
function onSend(sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = sendOrderActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (potentialActions.sendEmailMessage !== undefined) {
                // 互換性維持のため、すでにメール送信タスクが存在するかどうか確認し、なければタスク追加
                const sendEmailMessageTaskDoc = await repos.task.taskModel.findOne({
                    name: factory.taskName.SendEmailMessage,
                    'data.actionAttributes.object.identifier': {
                        $exists: true,
                        $eq: potentialActions.sendEmailMessage.object.identifier
                    }
                }).exec();
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (sendEmailMessageTaskDoc === null) {
                    const sendEmailMessageTask: factory.task.sendEmailMessage.IAttributes = {
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        lastTriedAt: null,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: potentialActions.sendEmailMessage
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                }
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}

/**
 * ポイントインセンティブ入金実行
 * 取引中に入金取引の承認アクションを完了しているはずなので、その取引を確定するだけの処理です。
 */
export function givePointAward(params: factory.task.givePointAward.IData) {
    return async (repos: {
        action: ActionRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            // 入金取引確定
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: params.object.pointAPIEndpoint,
                auth: repos.pecorinoAuthClient
            });
            await depositService.confirm({ transactionId: params.object.pointTransaction.id });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(params.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.transfer.give.pointAward.IResult = {};
        await repos.action.complete(params.typeOf, action.id, actionResult);
    };
}

/**
 * ポイントインセンティブ返却実行
 */
export function returnPointAward(params: factory.task.returnPointAward.IData) {
    return async (repos: {
        action: ActionRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        // アクション開始
        const placeOrderTransaction = params.object.purpose;
        const pecorinoAwardAuthorizeActionResult = params.object.result;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (pecorinoAwardAuthorizeActionResult === undefined) {
            throw new factory.errors.NotFound('params.object.result');
        }

        let withdrawTransaction: pecorinoapi.factory.transaction.withdraw.ITransaction<factory.accountType.Point>;
        const action = await repos.action.start(params);

        try {
            // 入金した分を引き出し取引実行
            const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                endpoint: pecorinoAwardAuthorizeActionResult.pointAPIEndpoint,
                auth: repos.pecorinoAuthClient
            });
            withdrawTransaction = await withdrawService.start({
                // tslint:disable-next-line:no-magic-numbers
                expires: moment().add(5, 'minutes').toDate(),
                agent: {
                    typeOf: params.agent.typeOf,
                    id: params.agent.id,
                    name: `PlaceOrderTransaction-${placeOrderTransaction.id} Customer`,
                    url: params.agent.url
                },
                recipient: {
                    typeOf: params.recipient.typeOf,
                    id: params.recipient.id,
                    name: `PlaceOrderTransaction-${placeOrderTransaction.id} Seller`,
                    url: params.recipient.url
                },
                amount: pecorinoAwardAuthorizeActionResult.pointTransaction.object.amount,
                notes: 'Cinerino 返品によるポイントインセンティブ取消',
                accountType: factory.accountType.Point,
                fromAccountNumber: pecorinoAwardAuthorizeActionResult.pointTransaction.object.toAccountNumber
            });
            await withdrawService.confirm({ transactionId: withdrawTransaction.id });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.transfer.returnAction.pointAward.IResult = {
            pointTransaction: withdrawTransaction
        };
        await repos.action.complete(action.typeOf, action.id, actionResult);
    };
}

/**
 * ポイントインセンティブ承認取消
 * @param params.transactionId 取引ID
 */
export function cancelPointAward(params: {
    transactionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        pecorinoAuthClient: pecorinoapi.auth.ClientCredentials;
    }) => {
        // ポイントインセンティブ承認アクションを取得
        const authorizeActions = <factory.action.authorize.award.point.IAction[]>
            await repos.action.findAuthorizeByTransactionId(params.transactionId)
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward)
                    .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                );

        await Promise.all(authorizeActions.map(async (action) => {
            // 承認アクション結果は基本的に必ずあるはず
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (action.result === undefined) {
                throw new factory.errors.NotFound('action.result');
            }

            // 進行中の入金取引を中止する
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: action.result.pointAPIEndpoint,
                auth: repos.pecorinoAuthClient
            });
            await depositService.cancel({
                transactionId: action.result.pointTransaction.id
            });
        }));
    };
}
