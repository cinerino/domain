/**
 * 配送サービス
 * ここでいう「配送」とは、「エンドユーザーが取得した所有権を利用可能な状態にすること」を指します。
 * つまり、物理的なモノの配送だけに限らず、
 * 座席予約で言えば、入場可能、つまり、QRコードが所有権として発行されること
 * ポイントインセンティブで言えば、口座に振り込まれること
 * などが配送処理として考えられます。
 */
import * as moment from 'moment';
import * as util from 'util';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

import { factory } from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../repo/action/registerServiceInProgress';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import { createOwnershipInfosFromOrder } from './delivery/factory';
import { processUnlock } from './offer/product';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood>;

/**
 * 注文を配送する
 */
export function sendOrder(params: factory.action.transfer.send.order.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        order: chevre.service.Order;
        ownershipInfo: chevre.service.OwnershipInfo;
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

            try {
                // 注文ステータス変更(chevre連携)
                order = await repos.order.deliverOrder({ orderNumber: order.orderNumber });
            } catch (error) {
                let throwsError = true;

                // すでにOrderReturnedだった場合、OrderDelivered->OrderReturnedの処理自体は成功しているので、後処理を続行する
                order = await repos.order.findByOrderNumber({ orderNumber: order.orderNumber });
                if (order.orderStatus === factory.orderStatus.OrderReturned) {
                    throwsError = false;
                }

                if (throwsError) {
                    throw error;
                }
            }

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
                const productId = (<factory.ownershipInfo.IServiceOutput>o.typeOfGood).issuedThrough?.id;
                if (typeof productId === 'string') {
                    await processUnlock({
                        agent: { id: String(o.ownedBy.id) },
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
                    (a): factory.task.IAttributes<factory.taskName.ConfirmRegisterService> => {
                        return {
                            project: a.project,
                            name: factory.taskName.ConfirmRegisterService,
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
                    (a): factory.task.IAttributes<factory.taskName.ConfirmMoneyTransfer> => {
                        return {
                            project: a.project,
                            name: <factory.taskName.ConfirmMoneyTransfer>factory.taskName.ConfirmMoneyTransfer,
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
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient,
                project: { id: params.project.id }
            });
            const { transactionNumber } = await transactionNumberService.publish({
                project: { id: params.project.id }
            });

            // Chevreで入金
            const moneyTransferService = new chevre.service.assetTransaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient,
                project: { id: params.project.id }
            });

            const startParams = createGivePointAwardStartParams(params, transactionNumber);
            await moneyTransferService.start(startParams);

            await moneyTransferService.confirm({ transactionNumber: transactionNumber });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: params.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.transfer.give.pointAward.IResult = {};
        await repos.action.complete({ typeOf: params.typeOf, id: action.id, result: actionResult });
    };
}

function createGivePointAwardStartParams(
    params: factory.task.IData<factory.taskName.GivePointAward>,
    transactionNumber: string
): factory.chevre.assetTransaction.moneyTransfer.IStartParamsWithoutDetail {
    const agent = {
        typeOf: params.agent.typeOf,
        id: params.agent.id,
        name: (typeof params.agent.name === 'string')
            ? params.agent.name
            : (typeof params.agent.name?.ja === 'string') ? params.agent.name?.ja : '',
        url: params.agent.url
    };

    const recipient: factory.chevre.assetTransaction.moneyTransfer.IRecipient
        // tslint:disable-next-line:no-object-literal-type-assertion
        = <factory.person.IPerson | factory.creativeWork.softwareApplication.webApplication.ICreativeWork>
        {
            typeOf: params.recipient.typeOf,
            id: params.recipient.id,
            name: (typeof params.recipient.name === 'string')
                ? params.recipient.name
                : (typeof (<factory.person.IPerson>params.recipient).givenName === 'string')
                    ? `${(<factory.person.IPerson>params.recipient).givenName} ${(<factory.person.IPerson>params.recipient).familyName}`
                    : ''
        };

    const identifier = createPointAwardIdentifier({
        project: params.project,
        purpose: params.purpose,
        toLocation: { accountNumber: params.object.toLocation.accountNumber }
    });

    return {
        // ユニークネスを保証するために識別子を指定する
        identifier: identifier,
        transactionNumber: transactionNumber,
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: chevre.factory.assetTransactionType.MoneyTransfer,
        agent: agent,
        expires: moment()
            .add(1, 'minutes')
            .toDate(),
        recipient: recipient,
        object: {
            amount: {
                typeOf: 'MonetaryAmount',
                currency: params.object.toLocation.accountType,
                value: params.object.amount
            },
            description: (typeof params.object.description === 'string')
                ? params.object.description
                : params.purpose.typeOf,
            fromLocation: agent,
            toLocation: {
                typeOf: params.object.toLocation.typeOf,
                identifier: params.object.toLocation.accountNumber
            },
            pendingTransaction: {
                typeOf: factory.pecorino.transactionType.Deposit,
                id: '' // 空でok
            }
        }
    };
}

export function createPointAwardIdentifier(params: {
    project: { id: string };
    purpose: { orderNumber: string };
    toLocation: { accountNumber: string };
}): string {
    return util.format(
        '%s:%s:%s:%s',
        params.project.id,
        'givePointAward',
        params.purpose.orderNumber,
        params.toLocation.accountNumber
    );
}

/**
 * インセンティブ返却実行
 */
export function returnPointAward(params: factory.task.IData<factory.taskName.ReturnPointAward>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // アクション開始
        const givePointAwardAction = params.object;
        const order = givePointAwardAction.purpose;
        const givePointAwardActionObject = givePointAwardAction.object;

        let moneyTransferTransaction: chevre.factory.assetTransaction.moneyTransfer.ITransaction;
        const action = await repos.action.start(params);

        try {
            const transactionNumberService = new chevre.service.TransactionNumber({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient,
                project: { id: params.project.id }
            });
            const { transactionNumber } = await transactionNumberService.publish({
                project: { id: params.project.id }
            });

            // Chevreで入金した分を出金
            const moneyTransferService = new chevre.service.assetTransaction.MoneyTransfer({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient,
                project: { id: params.project.id }
            });

            const recipient = {
                project: params.project,
                typeOf: params.recipient.typeOf,
                id: params.recipient.id,
                name: order.seller.name,
                url: params.recipient.url
            };

            moneyTransferTransaction = await moneyTransferService.start({
                transactionNumber: transactionNumber,
                project: { typeOf: order.project.typeOf, id: order.project.id },
                typeOf: chevre.factory.assetTransactionType.MoneyTransfer,
                agent: {
                    typeOf: params.agent.typeOf,
                    id: params.agent.id,
                    name: String(order.customer.name),
                    url: params.agent.url
                },
                expires: moment()
                    .add(1, 'minutes')
                    .toDate(),
                recipient: <factory.seller.ISeller>recipient,
                object: {
                    amount: {
                        typeOf: 'MonetaryAmount',
                        currency: givePointAwardActionObject.toLocation.accountType,
                        value: givePointAwardActionObject.amount
                    },
                    fromLocation: {
                        typeOf: givePointAwardActionObject.toLocation.typeOf,
                        identifier: givePointAwardActionObject.toLocation.accountNumber
                    },
                    toLocation: recipient,
                    description: `[Return Award]${givePointAwardActionObject.description}`,
                    pendingTransaction: {
                        typeOf: factory.pecorino.transactionType.Withdraw,
                        id: '' // 空でok
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
        const actionResult: factory.action.transfer.returnAction.pointAward.IResult = {
            pointTransaction: moneyTransferTransaction
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}
