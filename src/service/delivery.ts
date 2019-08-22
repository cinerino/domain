/**
 * 配送サービス
 * ここでいう「配送」とは、「エンドユーザーが取得した所有権を利用可能な状態にすること」を指します。
 * つまり、物理的なモノの配送だけに限らず、
 * 座席予約で言えば、入場可能、つまり、QRコードが所有権として発行されること
 * ポイントインセンティブで言えば、口座に振り込まれること
 * などが配送処理として考えられます。
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as util from 'util';

import { credentials } from '../credentials';

import * as factory from '../factory';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../repo/action/registerProgramMembershipInProgress';
import { MongoRepository as OrderRepo } from '../repo/order';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as TaskRepo } from '../repo/task';

const debug = createDebug('cinerino-domain:service');

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
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
        const order = params.object;

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
            await repos.order.changeStatus({
                orderNumber: order.orderNumber,
                orderStatus: factory.orderStatus.OrderDelivered
            });

            // 会員プログラムがアイテムにある場合は、所有権が作成されたこのタイミングで登録プロセスロック解除
            const programMembershipOwnershipInfos
                = <factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGood<'ProgramMembership'>>[]>
                ownershipInfos.filter((o) => o.typeOfGood.typeOf === 'ProgramMembership');
            await Promise.all(programMembershipOwnershipInfos.map(async (o) => {
                const memberOf = <factory.programMembership.IProgramMembership>(<factory.person.IPerson>o.ownedBy).memberOf;
                await repos.registerActionInProgress.unlock({
                    membershipNumber: <string>memberOf.membershipNumber,
                    programMembershipId: <string>o.typeOfGood.id
                });
            }));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: sendOrderActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        // const result: factory.action.transfer.send.order.IResult = {
        //     ownershipInfos: ownershipInfos
        // };
        const result: factory.action.transfer.send.order.IResult = ownershipInfos;
        await repos.action.complete({ typeOf: sendOrderActionAttributes.typeOf, id: action.id, result: result });

        // 潜在アクション
        await onSend(sendOrderActionAttributes)({ task: repos.task });
    };
}

/**
 * 注文から所有権を作成する
 */
export function createOwnershipInfosFromOrder(params: {
    order: factory.order.IOrder;
}): IOwnershipInfo[] {
    // tslint:disable-next-line:max-func-body-length
    return params.order.acceptedOffers.map((acceptedOffer, offerIndex) => {
        const itemOffered = acceptedOffer.itemOffered;
        let ownershipInfo: IOwnershipInfo;
        const ownedFrom = params.order.orderDate;
        const seller = params.order.seller;
        let ownedThrough: Date;
        const acquiredFrom = {
            id: seller.id,
            typeOf: seller.typeOf,
            name: {
                ja: seller.name,
                en: ''
            },
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

        switch (itemOffered.typeOf) {
            case 'ProgramMembership':
                // どういう期間でいくらのオファーなのか
                const eligibleDuration = acceptedOffer.eligibleDuration;
                if (eligibleDuration === undefined) {
                    throw new factory.errors.NotFound('Order.acceptedOffers.eligibleDuration');
                }
                // 期間単位としては秒のみ実装
                if (eligibleDuration.unitCode !== factory.unitCode.Sec) {
                    throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for eligibleDuration.unitCode ');
                }
                ownedThrough = moment(params.order.orderDate)
                    .add(eligibleDuration.value, 'seconds')
                    .toDate();
                ownershipInfo = {
                    project: params.order.project,
                    id: '',
                    typeOf: <factory.ownershipInfo.OwnershipInfoType>'OwnershipInfo',
                    identifier: identifier,
                    ownedBy: params.order.customer,
                    acquiredFrom: acquiredFrom,
                    ownedFrom: ownedFrom,
                    ownedThrough: ownedThrough,
                    typeOfGood: itemOffered
                };

                break;

            case factory.chevre.reservationType.EventReservation:
                // イベント予約に対する所有権の有効期限はイベント終了日時までで十分だろう
                // 現時点では所有権対象がイベント予約のみなので、これで問題ないが、
                // 対象が他に広がれば、有効期間のコントロールは別でしっかり行う必要があるだろう
                ownedThrough = itemOffered.reservationFor.endDate;

                let bookingService = acceptedOffer.offeredThrough;
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
                        typeOf: <factory.ownershipInfo.OwnershipInfoType>'OwnershipInfo',
                        identifier: identifier,
                        ownedBy: params.order.customer,
                        acquiredFrom: acquiredFrom,
                        ownedFrom: ownedFrom,
                        ownedThrough: ownedThrough,
                        typeOfGood: { ...itemOffered, bookingService: bookingService }
                    };
                } else {
                    ownershipInfo = {
                        project: params.order.project,
                        typeOf: <factory.ownershipInfo.OwnershipInfoType>'OwnershipInfo',
                        id: '',
                        identifier: identifier,
                        ownedBy: params.order.customer,
                        acquiredFrom: acquiredFrom,
                        ownedFrom: ownedFrom,
                        ownedThrough: ownedThrough,
                        typeOfGood: {
                            typeOf: itemOffered.typeOf,
                            id: itemOffered.id,
                            reservationNumber: itemOffered.reservationNumber,
                            bookingService: bookingService
                        }
                    };
                }

                break;

            default:
                throw new factory.errors.NotImplemented(`Offered item type ${(<any>itemOffered).typeOf} not implemented`);
        }

        return ownershipInfo;
    });
}

/**
 * 注文配送後のアクション
 */
export function onSend(sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes) {
    return async (repos: { task: TaskRepo }) => {
        const potentialActions = sendOrderActionAttributes.potentialActions;
        const now = new Date();
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

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
                })
                    .exec();

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (sendEmailMessageTaskDoc === null) {
                    const sendEmailMessageTask: factory.task.IAttributes<factory.taskName.SendEmailMessage> = {
                        project: potentialActions.sendEmailMessage.project,
                        name: factory.taskName.SendEmailMessage,
                        status: factory.taskStatus.Ready,
                        runsAt: now, // なるはやで実行
                        remainingNumberOfTries: 3,
                        numberOfTried: 0,
                        executionResults: [],
                        data: {
                            actionAttributes: potentialActions.sendEmailMessage
                        }
                    };
                    taskAttributes.push(sendEmailMessageTask);
                }
            }

            // 会員プログラム更新タスクがあれば追加
            if (Array.isArray(potentialActions.registerProgramMembership)) {
                taskAttributes.push(...potentialActions.registerProgramMembership);
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
export function givePointAward(params: factory.task.IData<factory.taskName.GivePointAward>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            // 入金取引確定
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: params.object.pointAPIEndpoint,
                auth: pecorinoAuthClient
            });
            await depositService.confirm({ id: params.object.pointTransaction.id });
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
 * ポイントインセンティブ返却実行
 */
export function returnPointAward(params: factory.task.IData<factory.taskName.ReturnPointAward>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // アクション開始
        const order = params.object.purpose;
        const authorizePointAwardAction = params.object.object;

        let withdrawTransaction: pecorinoapi.factory.transaction.withdraw.ITransaction<factory.accountType.Point>;
        const action = await repos.action.start(params);
        try {
            // 入金した分を引き出し取引実行
            const withdrawService = new pecorinoapi.service.transaction.Withdraw({
                endpoint: authorizePointAwardAction.pointAPIEndpoint,
                auth: pecorinoAuthClient
            });
            withdrawTransaction = await withdrawService.start({
                typeOf: factory.pecorino.transactionType.Withdraw,
                agent: {
                    typeOf: params.agent.typeOf,
                    id: params.agent.id,
                    name: String(order.customer.name),
                    url: params.agent.url
                },
                expires: moment()
                    // tslint:disable-next-line:no-magic-numbers
                    .add(5, 'minutes')
                    .toDate(),
                recipient: {
                    typeOf: params.recipient.typeOf,
                    id: params.recipient.id,
                    name: order.seller.name,
                    url: params.recipient.url
                },
                object: {
                    amount: authorizePointAwardAction.pointTransaction.object.amount,
                    fromLocation: authorizePointAwardAction.pointTransaction.object.toLocation,
                    description: '注文返品によるポイントインセンティブ取消'
                }
            });

            await withdrawService.confirm(withdrawTransaction);
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
            pointTransaction: withdrawTransaction
        };
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * ポイントインセンティブ承認取消
 */
export function cancelPointAward(params: factory.task.IData<factory.taskName.CancelPointAward>) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // ポイントインセンティブ承認アクションを取得
        const authorizeActions = <factory.action.authorize.award.point.IAction[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: factory.transactionType.PlaceOrder,
                    id: params.transactionId
                }
            })
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward)
                );
        await Promise.all(authorizeActions.map(async (action) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (action.result !== undefined) {
                // アクションステータスに関係なく取消処理実行
                const depositService = new pecorinoapi.service.transaction.Deposit({
                    endpoint: action.result.pointAPIEndpoint,
                    auth: pecorinoAuthClient
                });

                await depositService.cancel({
                    id: action.result.pointTransaction.id
                });

                await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
            }
        }));
    };
}
