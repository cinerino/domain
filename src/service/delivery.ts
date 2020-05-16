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
import * as util from 'util';

import { credentials } from '../credentials';

import * as chevre from '../chevre';

import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../repo/action/registerProgramMembershipInProgress';
import { RedisRepository as MoneyTransferTransactionNumberRepo } from '../repo/moneyTransferTransactionNumber';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';

const debug = createDebug('cinerino-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;
export type IOwnershipInfo = factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.ownershipInfo.IGoodType>>;

/**
 * 注文を配送する
 */
export function sendOrder(params: factory.action.transfer.send.order.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        ownershipInfo: OwnershipInfoRepo;
        registerActionInProgress: RegisterProgramMembershipInProgressRepo;
        task: TaskRepo;
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

            // 会員プログラムがアイテムにある場合は、所有権が作成されたこのタイミングで登録プロセスロック解除
            const programMembershipOwnershipInfos
                // tslint:disable-next-line:max-line-length
                = <factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<factory.programMembership.ProgramMembershipType.ProgramMembership>>[]>
                ownershipInfos.filter(
                    (o) => o.typeOfGood.typeOf === factory.programMembership.ProgramMembershipType.ProgramMembership
                );
            await Promise.all(programMembershipOwnershipInfos.map(async (o) => {
                const customer = <factory.person.IPerson>o.ownedBy;
                // const memberOf = <factory.programMembership.IProgramMembership>(<factory.person.IPerson>o.ownedBy).memberOf;
                await repos.registerActionInProgress.unlock({
                    id: customer.id,
                    programMembershipId: <string>o.typeOfGood.membershipFor?.id
                });
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
    };
}

/**
 * 注文から所有権を作成する
 */
export function createOwnershipInfosFromOrder(params: {
    order: factory.order.IOrder;
}): IOwnershipInfo[] {
    const ownershipInfos: IOwnershipInfo[] = [];

    params.order.acceptedOffers.forEach((acceptedOffer, offerIndex) => {
        const itemOffered = acceptedOffer.itemOffered;

        let ownershipInfo: IOwnershipInfo | undefined;

        const ownedFrom = params.order.orderDate;

        const seller = params.order.seller;
        const acquiredFrom = {
            project: params.order.project,
            id: seller.id,
            typeOf: seller.typeOf,
            name: { ja: seller.name, en: '' },
            telephone: seller.telephone,
            url: seller.url
        };

        const identifier = util.format(
            '%s-%s-%s-%s',
            params.order.customer.id,
            itemOffered.typeOf,
            params.order.orderNumber,
            offerIndex
        );

        switch (true) {
            case new RegExp(`^${factory.programMembership.ProgramMembershipType.ProgramMembership}$`).test(itemOffered.typeOf):
                // case factory.programMembership.ProgramMembershipType.ProgramMembership:
                ownershipInfo = createProgramMembershipOwnershipInfo({
                    order: params.order,
                    acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
                    ownedFrom: ownedFrom,
                    identifier: identifier,
                    acquiredFrom: acquiredFrom
                });

                break;

            case new RegExp(`^${factory.chevre.reservationType.EventReservation}$`).test(itemOffered.typeOf):
                ownershipInfo = createReservationOwnershipInfo({
                    order: params.order,
                    acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
                    ownedFrom: ownedFrom,
                    identifier: identifier,
                    acquiredFrom: acquiredFrom
                });

                break;

            // tslint:disable-next-line:no-suspicious-comment
            // TODO Chevre決済カードサービスに対して動的にコントロール
            case new RegExp(`PaymentCard$`).test(itemOffered.typeOf):
                ownershipInfo = createPaymentCardOwnershipInfo({
                    order: params.order,
                    acceptedOffer: { ...acceptedOffer, itemOffered: <any>itemOffered },
                    ownedFrom: ownedFrom,
                    identifier: identifier,
                    acquiredFrom: acquiredFrom
                });

                break;

            case new RegExp(`^MonetaryAmount$`).test(itemOffered.typeOf):
                // no op
                break;

            default:
                throw new factory.errors.NotImplemented(`Offered item type ${(<any>itemOffered).typeOf} not implemented`);
        }

        if (ownershipInfo !== undefined) {
            ownershipInfos.push(ownershipInfo);
        }
    });

    return ownershipInfos;
}

function createReservationOwnershipInfo(params: {
    order: factory.order.IOrder;
    acceptedOffer: factory.order.IAcceptedOffer<factory.order.IReservation>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    const itemOffered = params.acceptedOffer.itemOffered;

    let ownershipInfo: IOwnershipInfo;

    // イベント予約に対する所有権の有効期限はイベント終了日時までで十分だろう
    // 現時点では所有権対象がイベント予約のみなので、これで問題ないが、
    // 対象が他に広がれば、有効期間のコントロールは別でしっかり行う必要があるだろう
    const ownedThrough = itemOffered.reservationFor.endDate;

    let bookingService = params.acceptedOffer.offeredThrough;
    if (bookingService === undefined) {
        // デフォルトブッキングサービスはChevre
        bookingService = {
            typeOf: 'WebAPI',
            identifier: factory.service.webAPI.Identifier.Chevre
        };
    }

    if (bookingService.identifier === factory.service.webAPI.Identifier.COA) {
        // COA予約の場合、typeOfGoodにはアイテムをそのまま挿入する
        ownershipInfo = {
            project: params.order.project,
            id: '',
            typeOf: 'OwnershipInfo',
            identifier: params.identifier,
            ownedBy: params.order.customer,
            acquiredFrom: params.acquiredFrom,
            ownedFrom: params.ownedFrom,
            ownedThrough: ownedThrough,
            typeOfGood: { ...itemOffered, bookingService: bookingService }
        };
    } else {
        ownershipInfo = {
            project: params.order.project,
            typeOf: 'OwnershipInfo',
            id: '',
            identifier: params.identifier,
            ownedBy: params.order.customer,
            acquiredFrom: params.acquiredFrom,
            ownedFrom: params.ownedFrom,
            ownedThrough: ownedThrough,
            typeOfGood: {
                typeOf: itemOffered.typeOf,
                id: itemOffered.id,
                reservationNumber: itemOffered.reservationNumber,
                bookingService: bookingService
            }
        };
    }

    return ownershipInfo;
}

function createPaymentCardOwnershipInfo(params: {
    order: factory.order.IOrder;
    acceptedOffer: factory.order.IAcceptedOffer<factory.chevre.paymentMethod.paymentCard.IPaymentCard>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    const itemOffered = params.acceptedOffer.itemOffered;

    let ownershipInfo: IOwnershipInfo;

    // tslint:disable-next-line:no-suspicious-comment
    // TODO 要調整
    const ownedThrough = moment(params.ownedFrom)
        .add(1, 'year')
        .toDate();

    ownershipInfo = {
        project: params.order.project,
        typeOf: 'OwnershipInfo',
        id: '',
        identifier: params.identifier,
        ownedBy: params.order.customer,
        acquiredFrom: params.acquiredFrom,
        ownedFrom: params.ownedFrom,
        ownedThrough: ownedThrough,
        typeOfGood: {
            typeOf: itemOffered.typeOf,
            identifier: itemOffered.identifier
        }
    };

    return ownershipInfo;
}

function createProgramMembershipOwnershipInfo(params: {
    order: factory.order.IOrder;
    acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>;
    ownedFrom: Date;
    identifier: string;
    acquiredFrom: factory.ownershipInfo.IOwner;
}): IOwnershipInfo {
    // どういう期間でいくらのオファーなのか
    const priceSpec =
        <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
        params.acceptedOffer.priceSpecification;
    if (priceSpec === undefined) {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification');
    }

    const unitPriceSpec =
        <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
        priceSpec.priceComponent.find(
            (p) => p.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
        );
    if (unitPriceSpec === undefined) {
        throw new factory.errors.NotFound('Unit Price Specification in Order.acceptedOffers.priceSpecification');
    }

    // 期間単位としては秒のみ実装
    if (unitPriceSpec.referenceQuantity.unitCode !== factory.unitCode.Sec) {
        throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for priceSpecification.referenceQuantity.unitCode ');
    }
    const referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
    if (typeof referenceQuantityValue !== 'number') {
        throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification.referenceQuantity.value');
    }
    const ownedThrough = moment(params.ownedFrom)
        .add(referenceQuantityValue, 'seconds')
        .toDate();

    return {
        project: params.order.project,
        id: '',
        typeOf: 'OwnershipInfo',
        identifier: params.identifier,
        ownedBy: params.order.customer,
        acquiredFrom: params.acquiredFrom,
        ownedFrom: params.ownedFrom,
        ownedThrough: ownedThrough,
        typeOfGood: params.acceptedOffer.itemOffered
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

            // 会員プログラム更新タスクがあれば追加
            if (Array.isArray(potentialActions.registerProgramMembership)) {
                taskAttributes.push(...potentialActions.registerProgramMembership.map(
                    (a): factory.task.IAttributes<factory.taskName.RegisterProgramMembership> => {
                        return {
                            project: a.project,
                            name: factory.taskName.RegisterProgramMembership,
                            status: factory.taskStatus.Ready,
                            runsAt: now, // なるはやで実行
                            remainingNumberOfTries: 10,
                            numberOfTried: 0,
                            executionResults: [],
                            data: a
                        };
                    })
                );
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
        moneyTransferTransactionNumber: MoneyTransferTransactionNumberRepo;
        project: ProjectRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const project = await repos.project.findById({ id: params.project.id });
            if (typeof project.settings?.chevre?.endpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const transactionNumber = await repos.moneyTransferTransactionNumber.publishByTimestamp({
                project: { id: project.id },
                startDate: new Date()
            });

            // Chevreで入金
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: project.settings.chevre.endpoint,
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
        moneyTransferTransactionNumber: MoneyTransferTransactionNumberRepo;
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
            const endpoint = project.settings?.chevre?.endpoint;
            if (typeof endpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const transactionNumber = await repos.moneyTransferTransactionNumber.publishByTimestamp({
                project: { id: project.id },
                startDate: new Date()
            });

            // Chevreで入金した分を出金
            const moneyTransferService = new chevre.service.transaction.MoneyTransfer({
                endpoint: endpoint,
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
