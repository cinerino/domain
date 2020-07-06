/**
 * 配送サービス
 * ここでいう「配送」とは、「エンドユーザーが取得した所有権を利用可能な状態にすること」を指します。
 * つまり、物理的なモノの配送だけに限らず、
 * 座席予約で言えば、入場可能、つまり、QRコードが所有権として発行されること
 * ポイントインセンティブで言えば、口座に振り込まれること
 * などが配送処理として考えられます。
 */
import * as createDebug from 'debug';
import * as moment from 'moment';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../repo/action/registerServiceInProgress';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import { createOwnershipInfosFromOrder } from './delivery/factory';
import { processUnlock } from './offer/product';

const debug = createDebug('cinerino-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

/**
 * 注文を配送する
 */
export function sendOrder(params: factory.action.transfer.send.order.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        ownershipInfo: OwnershipInfoRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        let order = params.object;

        // アクション開始
        const sendOrderActionAttributes = params;
        const action = await repos.action.start(sendOrderActionAttributes);
        let ownershipInfos: IOwnershipInfo[];

        try {
            // 所有権作成
            ownershipInfos = createOwnershipInfosFromOrder({ order });
            ownershipInfos = await Promise.all(ownershipInfos.map(async (ownershipInfo) => {
                return repos.ownershipInfo.saveByIdentifier(ownershipInfo);
            }));

            // 注文ステータス変更
            order = await repos.order.changeStatus({
                orderNumber: order.orderNumber,
                orderStatus: factory.orderStatus.OrderDelivered
            });

            // 注文取引検索
            const searchTransactionsResult = await repos.transaction.search<factory.transactionType.PlaceOrder>({
                typeOf: factory.transactionType.PlaceOrder,
                result: { order: { orderNumbers: [order.orderNumber] } }
            });
            const transaction = searchTransactionsResult.shift();
            if (transaction === undefined) {
                throw new factory.errors.NotFound('PlaceOrder transaction for order');
            }

            // プロダクト登録プロセスロック解除
            await Promise.all(ownershipInfos.map(async (o) => {
                const productId = o.typeOfGood.issuedThrough?.id;
                if (typeof productId === 'string') {
                    await processUnlock({
                        agent: { id: o.ownedBy.id },
                        product: { id: productId },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    })(repos);
                }
            }));
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: sendOrderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (_) {
                // no op
            }

            throw error;
        }

        const result: factory.action.transfer.send.order.IResult = ownershipInfos;
        await repos.action.complete({ typeOf: sendOrderActionAttributes.typeOf, id: action.id, result: result });

        await onSend(sendOrderActionAttributes, order)({ task: repos.task });

        return result;
    };
}

/**
 * 注文配送後のアクション
 */
export function onSend(
    sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes,
    order: factory.order.IOrder
) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = sendOrderActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (potentialActions !== undefined) {
            // 予約確定
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.confirmReservation)) {
                taskAttributes.push(...potentialActions.confirmReservation.map(
                    (a): factory.task.IAttributes<factory.taskName.ConfirmReservation> => {
                        return {
                            project: a.project,
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

            if (Array.isArray(potentialActions.registerService)) {
                taskAttributes.push(...potentialActions.registerService.map(
                    (a): factory.task.IAttributes<factory.taskName.RegisterService> => {
                        return {
                            project: a.project,
                            name: factory.taskName.RegisterService,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // 通貨転送
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.moneyTransfer)) {
                taskAttributes.push(...potentialActions.moneyTransfer.map(
                    (a): factory.task.IAttributes<factory.taskName.MoneyTransfer> => {
                        return {
                            project: a.project,
                            name: <factory.taskName.MoneyTransfer>factory.taskName.MoneyTransfer,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    }));
            }

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (Array.isArray(potentialActions.sendEmailMessage)) {
                potentialActions.sendEmailMessage.forEach((s) => {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: s.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: s
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                });
            }

            if (Array.isArray(potentialActions.informOrder)) {
                taskAttributes.push(...potentialActions.informOrder.map(
                    (a): factory.task.IAttributes<factory.taskName.TriggerWebhook> => {
                        return {
                            project: a.project,
                            name: factory.taskName.TriggerWebhook,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: {
                                ...a,
                                object: order
                            }
                        };
                    })
                );
            }
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}

/**
 * インセンティブ入金実行
 */
export function givePointAward(params: factory.task.IData<factory.taskName.GivePointAward>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });

            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const { transactionNumber } = await transactionNumberService.publish({
                project: { id: project.id }
            });

            // Chevreで入金
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            const agent = {
                typeOf: params.agent.typeOf,
                id: params.agent.id,
                name: (typeof params.agent.name === 'string')
                    ? params.agent.name
                    : (typeof params.agent.name?.ja === 'string') ? params.agent.name?.ja : '',
                url: params.agent.url
            };

            await moneyTransferService.start({
                transactionNumber: transactionNumber,
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: chevre.factory.transactionType.MoneyTransfer,
                agent: agent,
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
                recipient: <any>{
                    typeOf: params.recipient.typeOf,
                    id: params.recipient.id,
                    name: (typeof params.recipient.name === 'string')
                        ? params.recipient.name
                        : (typeof (<factory.person.IPerson>params.recipient).givenName === 'string')
                            ? `${(<factory.person.IPerson>params.recipient).givenName} ${(<factory.person.IPerson>params.recipient).familyName}`
                            : ''
                },
                object: {
                    amount: {
                        value: params.object.amount
                    },
                    description: (typeof params.object.description === 'string')
                        ? params.object.description
                        : params.purpose.typeOf,
                    fromLocation: agent,
                    toLocation: {
                        typeOf: params.object.toLocation.accountType,
                        identifier: params.object.toLocation.accountNumber
                    },
                    pendingTransaction: {
                        typeOf: factory.pecorino.transactionType.Deposit
                    },
                    ...{
                        ignorePaymentCard: true
                    }
                }
            });

            await moneyTransferService.confirm({ transactionNumber: transactionNumber });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: params.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.transfer.give.pointAward.IResult = {};
        await repos.action.complete({ typeOf: params.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * インセンティブ返却実行
 */
export function returnPointAward(params: factory.task.IData<factory.taskName.ReturnPointAward>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const givePointAwardAction = params.object;
        const order = givePointAwardAction.purpose;
        const givePointAwardActionObject = givePointAwardAction.object;

        let moneyTransferTransaction: chevre.factory.transaction.moneyTransfer.ITransaction;
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });

            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });
            const { transactionNumber } = await transactionNumberService.publish({
                project: { id: project.id }
            });

            // Chevreで入金した分を出金
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            const recipient = {
                typeOf: params.recipient.typeOf,
                id: params.recipient.id,
                name: order.seller.name,
                url: params.recipient.url
            };

            moneyTransferTransaction = await moneyTransferService.start({
                transactionNumber: transactionNumber,
                project: { typeOf: order.project.typeOf, id: order.project.id },
                typeOf: chevre.factory.transactionType.MoneyTransfer,
                agent: {
                    typeOf: params.agent.typeOf,
                    id: params.agent.id,
                    name: String(order.customer.name),
                    url: params.agent.url
                },
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
                recipient: <any>recipient,
                object: {
                    amount: { value: givePointAwardActionObject.amount },
                    fromLocation: {
                        typeOf: factory.pecorino.account.TypeOf.Account,
                        accountNumber: givePointAwardActionObject.toLocation.accountNumber,
                        accountType: givePointAwardActionObject.toLocation.accountType
                    },
                    toLocation: recipient,
                    description: `${givePointAwardActionObject.description}取消`,
                    pendingTransaction: {
                        typeOf: factory.pecorino.transactionType.Withdraw
                    },
                    ...{
                        ignorePaymentCard: true
                    }
                }
            });

            await moneyTransferService.confirm({ transactionNumber: transactionNumber });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.transfer.returnAction.pointAward.IResult = {
            pointTransaction: moneyTransferTransaction
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
