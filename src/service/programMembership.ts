/**
 * 会員プログラムサービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../repo/action/registerProgramMembershipInProgress';
import { RedisRepository as OrderNumberRepo } from '../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../repo/person';
import { MongoRepository as ProgramMembershipRepo } from '../repo/programMembership';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as SellerRepo } from '../repo/seller';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as CreditCardPaymentService from './payment/creditCard';
import * as PlaceOrderService from './transaction/placeOrderInProgress';

import * as factory from '../factory';

/**
 * GMOメンバーIDにユーザーネームを使用するかどうか
 */
const USE_USERNAME_AS_GMO_MEMBER_ID = process.env.USE_USERNAME_AS_GMO_MEMBER_ID === '1';
const EMAIL_INFORM_UPDATE_PROGRAMMEMBERSHIP = process.env.EMAIL_INFORM_UPDATE_PROGRAMMEMBERSHIP;

export type ICreateRegisterTaskOperation<T> = (repos: {
    programMembership: ProgramMembershipRepo;
    seller: SellerRepo;
    task: TaskRepo;
}) => Promise<T>;
export type ICreateUnRegisterTaskOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    task: TaskRepo;
}) => Promise<T>;

export type IOrderOperation<T> = (repos: {
    action: ActionRepo;
    creditCard: CreditCardRepo;
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    programMembership: ProgramMembershipRepo;
    project: ProjectRepo;
    registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type IRegisterOperation<T> = (repos: {
    action: ActionRepo;
    person: PersonRepo;
    task: TaskRepo;
}) => Promise<T>;

/**
 * 会員プログラム登録タスクを作成する
 */
// tslint:disable-next-line:max-func-body-length
export function createRegisterTask(params: {
    agent: factory.person.IPerson;
    /**
     * 会員プログラムのオファー識別子
     */
    offerIdentifier: string;
    /**
     * 会員プログラムID
     */
    programMembershipId: string;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: {
        /**
         * 販売者タイプ
         * どの販売者に属した会員プログラムを登録するか
         */
        typeOf: factory.organizationType;
        /**
         * 販売者ID
         * どの販売者に属した会員プログラムを登録するか
         */
        id: string;
    };
    sendEmailMessage?: boolean;
    email?: factory.creativeWork.message.email.ICustomization;
}): ICreateRegisterTaskOperation<factory.task.ITask<factory.taskName.OrderProgramMembership>> {
    return async (repos: {
        programMembership: ProgramMembershipRepo;
        seller: SellerRepo;
        task: TaskRepo;
    }) => {
        const now = new Date();
        const programMemberships = await repos.programMembership.search({ id: params.programMembershipId });
        const programMembership = programMemberships.shift();
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership === undefined) {
            throw new factory.errors.NotFound('ProgramMembership');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership.offers === undefined) {
            throw new factory.errors.NotFound('ProgramMembership.offers');
        }
        const offer = programMembership.offers.find((o) => o.identifier === params.offerIdentifier);
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (offer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (offer.price === undefined) {
            throw new factory.errors.NotFound('Offer Price undefined');
        }

        const seller = await repos.seller.findById({
            id: params.seller.id
        });
        // 会員プログラムのホスト組織確定(この組織が決済対象となる)
        programMembership.hostingOrganization = {
            id: seller.id,
            identifier: seller.identifier,
            name: seller.name,
            legalName: seller.legalName,
            location: seller.location,
            typeOf: seller.typeOf,
            telephone: seller.telephone,
            url: seller.url
        };

        const itemOffered = {
            ...programMembership,
            offers: programMembership.offers.map((o) => {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if */
                if (o.price === undefined) {
                    throw new factory.errors.NotFound('Offer Price undefined');
                }

                return {
                    ...o,
                    price: o.price
                };
            })
        };

        // 受け入れれたオファーオブジェクトを作成
        const acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership> = {
            typeOf: 'Offer',
            identifier: offer.identifier,
            price: offer.price,
            priceCurrency: offer.priceCurrency,
            eligibleDuration: offer.eligibleDuration,
            itemOffered: itemOffered,
            seller: {
                typeOf: seller.typeOf,
                name: seller.name.ja
            }
        };

        // 登録アクション属性を作成
        const data: factory.task.IData<factory.taskName.OrderProgramMembership> = {
            agent: params.agent,
            object: acceptedOffer,
            potentialActions: params.potentialActions,
            project: programMembership.project,
            sendEmailMessage: params.sendEmailMessage,
            email: params.email,
            typeOf: factory.actionType.OrderAction
        };

        // 会員プログラム登録タスクを作成する
        const taskAttributes: factory.task.IAttributes<factory.taskName.OrderProgramMembership> = {
            project: data.project,
            name: factory.taskName.OrderProgramMembership,
            status: factory.taskStatus.Ready,
            runsAt: now,
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: data
        };

        return repos.task.save<factory.taskName.OrderProgramMembership>(taskAttributes);
    };
}

/**
 * 会員プログラム注文
 */
export function orderProgramMembership(
    params: factory.task.IData<factory.taskName.OrderProgramMembership>
): IOrderOperation<void> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        ownershipInfo: OwnershipInfoRepo;
        person: PersonRepo;
        programMembership: ProgramMembershipRepo;
        project: ProjectRepo;
        registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const projectId = (params.project !== undefined) ? params.project.id : <string>process.env.PROJECT_ID;
        const project = await repos.project.findById({ id: projectId });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({
            userPooId: <string>process.env.COGNITO_USER_POOL_ID,
            userId: params.agent.id
        });

        const acceptedOffer = params.object;
        if (acceptedOffer.typeOf !== 'Offer') {
            throw new factory.errors.Argument('Object', 'Object type must be Offer');
        }

        const programMembership = acceptedOffer.itemOffered;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership.id === undefined) {
            throw new factory.errors.ArgumentNull('ProgramMembership ID');
        }

        const seller = programMembership.hostingOrganization;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

        const programMemberships = await repos.ownershipInfo.search<factory.programMembership.ProgramMembershipType>({
            typeOfGood: {
                typeOf: 'ProgramMembership',
                ids: [programMembership.id]
            },
            ownedBy: { id: customer.id },
            ownedFrom: now,
            ownedThrough: now
        });
        // すでに会員プログラムに加入済であれば何もしない
        const selectedProgramMembership = programMemberships.find((p) => p.typeOfGood.id === programMembership.id);
        if (selectedProgramMembership !== undefined) {
            // Already registered

            return;
        }

        // 新規登録かどうか、所有権で確認
        // const programMembershipOwnershipInfos = await repos.ownershipInfo.search<'ProgramMembership'>({
        //     limit: 1,
        //     typeOfGood: {
        //         typeOf: 'ProgramMembership',
        //         ids: [programMembership.id]
        //     },
        //     ownedBy: { id: customer.id }
        // });
        // const isNewRegister = programMembershipOwnershipInfos.length === 0;

        // アクション開始
        // const registerActionAttibutes: factory.action.interact.register.programMembership.IAttributes = {
        //     ...params,
        //     object: {
        //         typeOf: programMembership.typeOf,
        //         id: programMembership.id,
        //         hostingOrganization: seller,
        //         name: programMembership.name,
        //         programName: programMembership.programName,
        //         project: programMembership.project,
        //         award: programMembership.award
        //     }
        // };
        // const action = await repos.action.start(registerActionAttibutes);

        // let order: factory.order.IOrder;
        let lockNumber: number | undefined;
        try {
            // 登録処理を進行中に変更。進行中であれば競合エラー。
            lockNumber = await repos.registerActionInProgressRepo.lock(
                {
                    id: customer.id,
                    programMembershipId: programMembership.id
                },
                // action.id
                '1' // いったん値はなんでもよい
            );

            await processPlaceOrder({
                acceptedOffer: acceptedOffer,
                customer: customer,
                potentialActions: params.potentialActions,
                project: project,
                seller: seller,
                sendEmailMessage: params.sendEmailMessage,
                email: params.email
            })(repos);
            // order = placeOrderResult.order;
        } catch (error) {
            // actionにエラー結果を追加
            // try {
            //     // tslint:disable-next-line:max-line-length no-single-line-block-comment
            //     const actionError = { ...error, ...{ message: error.message, name: error.name } };
            //     await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            // } catch (__) {
            //     // 失敗したら仕方ない
            // }

            try {
                // 本プロセスがlockした場合は解除する。解除しなければタスクのリトライが無駄になってしまう。
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (lockNumber !== undefined) {
                    await repos.registerActionInProgressRepo.unlock({
                        id: customer.id,
                        programMembershipId: programMembership.id
                    });
                }
            } catch (error) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // const actionResult: factory.action.interact.register.programMembership.IResult = {
        //     order: order
        // };
        // await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * 会員プログラム登録
 * 登録アクションの後で、次回の会員プログラム注文タスクを作成する
 */
export function register(
    params: factory.task.IData<factory.taskName.RegisterProgramMembership>
): IRegisterOperation<void> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        person: PersonRepo;
        task: TaskRepo;
    }) => {
        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        await repos.person.findById({
            userPooId: <string>process.env.COGNITO_USER_POOL_ID,
            userId: params.agent.id
        });

        const acceptedOffer = params.object;
        if (acceptedOffer.typeOf !== 'ProgramMembership') {
            throw new factory.errors.Argument('Object', 'Object type must be ProgramMembership');
        }

        const programMembership = acceptedOffer;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (programMembership.id === undefined) {
            throw new factory.errors.ArgumentNull('ProgramMembership ID');
        }

        const seller = programMembership.hostingOrganization;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

        // アクション開始
        const registerActionAttibutes: factory.action.interact.register.programMembership.IAttributes = params;
        const action = <factory.action.interact.register.programMembership.IAction>await repos.action.start(registerActionAttibutes);

        try {
            // 特に何もしない
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        const actionResult: factory.action.interact.register.programMembership.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });

        // 次の会員プログラム注文タスクを作成
        if (action.potentialActions !== undefined) {
            if (Array.isArray(action.potentialActions.orderProgramMembership)) {
                await Promise.all(action.potentialActions.orderProgramMembership.map(async (taskAttribute) => {
                    return repos.task.save(taskAttribute);
                }));
            }
        }
    };
}

/**
 * 会員プログラム登録解除タスクを作成する
 */
export function createUnRegisterTask(params: {
    agent: factory.person.IPerson;
    /**
     * 所有権識別子
     */
    ownershipInfoIdentifier: string;
}): ICreateUnRegisterTaskOperation<factory.task.ITask<factory.taskName.UnRegisterProgramMembership>> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        task: TaskRepo;
    }) => {
        // 所有している会員プログラムを検索
        const now = new Date();
        const ownershipInfos = await repos.ownershipInfo.search<factory.programMembership.ProgramMembershipType>({
            limit: 1,
            typeOfGood: { typeOf: 'ProgramMembership' },
            ownedBy: { id: params.agent.id },
            ownedFrom: now,
            ownedThrough: now,
            ...{
                identifiers: [params.ownershipInfoIdentifier]
            }
        });
        const ownershipInfo = ownershipInfos.shift();
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if: please write tests */
        if (ownershipInfo === undefined) {
            throw new factory.errors.NotFound('OwnershipInfo');
        }

        // 所有が確認できれば、会員プログラム登録解除タスクを作成する
        const unRegisterActionAttributes: factory.action.interact.unRegister.programMembership.IAttributes = {
            project: ownershipInfo.project,
            typeOf: factory.actionType.UnRegisterAction,
            agent: params.agent,
            object: ownershipInfo
        };
        const taskAttributes: factory.task.IAttributes<factory.taskName.UnRegisterProgramMembership> = {
            project: unRegisterActionAttributes.project,
            name: factory.taskName.UnRegisterProgramMembership,
            status: factory.taskStatus.Ready,
            runsAt: now,
            remainingNumberOfTries: 10,
            numberOfTried: 0,
            executionResults: [],
            data: unRegisterActionAttributes
        };

        return repos.task.save<factory.taskName.UnRegisterProgramMembership>(taskAttributes);
    };
}

/**
 * 会員プログラム登録解除
 */
export function unRegister(params: factory.action.interact.unRegister.programMembership.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        ownershipInfo: OwnershipInfoRepo;
        task: TaskRepo;
    }) => {
        // アクション開始
        const action = await repos.action.start(params);

        try {
            const customer = <factory.person.IPerson>params.object.ownedBy;
            const programMembershipId = params.object.typeOfGood.id;
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (programMembershipId === undefined) {
                throw new factory.errors.NotFound('params.object.typeOfGood.id');
            }

            // 会員プログラム更新タスク(継続課金タスク)をキャンセル
            await repos.task.taskModel.findOneAndUpdate(
                {
                    // 旧会員プログラム注文タスクへの互換性維持
                    name: { $in: [factory.taskName.OrderProgramMembership, factory.taskName.RegisterProgramMembership] },
                    'data.agent.id': {
                        $exists: true,
                        $eq: customer.id
                    },
                    'data.object.itemOffered.id': {
                        $exists: true,
                        $eq: programMembershipId
                    },
                    status: factory.taskStatus.Ready
                },
                { status: factory.taskStatus.Aborted }
            )
                .exec();

            // 所有権の期限変更
            await repos.ownershipInfo.ownershipInfoModel.findOneAndUpdate(
                { identifier: params.object.identifier },
                { ownedThrough: new Date() }
            )
                .exec();
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.interact.unRegister.programMembership.IResult = {};

        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * 会員プログラムを注文する
 */
function processPlaceOrder(params: {
    /**
     * 会員プログラムオファー
     */
    acceptedOffer: factory.action.interact.register.programMembership.IAcceptedOffer;
    /**
     * 購入者
     */
    customer: factory.person.IPerson;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    /**
     * プロジェクト
     */
    project: factory.project.IProject;
    /**
     * 販売者
     */
    seller: factory.seller.IOrganization<any>;
    sendEmailMessage?: boolean;
    email?: factory.creativeWork.message.email.ICustomization;
}) {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        programMembership: ProgramMembershipRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const now = new Date();

        const acceptedOffer = params.acceptedOffer;
        const programMembership = acceptedOffer.itemOffered;
        const customer = params.customer;
        const project = params.project;
        const seller = params.seller;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (customer.memberOf === undefined || customer.memberOf.membershipNumber === undefined) {
            throw new factory.errors.NotFound('Customer MembershipNumber');
        }

        // 会員プログラム注文取引進行
        const transaction = await PlaceOrderService.start({
            project: { typeOf: project.typeOf, id: project.id },
            expires: moment()
                // tslint:disable-next-line:no-magic-numbers
                .add(5, 'minutes')
                .toDate(),
            agent: customer,
            seller: { typeOf: seller.typeOf, id: seller.id },
            object: {}
        })(repos);

        // 新規登録かどうか、所有権で確認
        const programMembershipOwnershipInfos = await repos.ownershipInfo.search<'ProgramMembership'>({
            limit: 1,
            typeOfGood: {
                typeOf: 'ProgramMembership',
                ids: [<string>programMembership.id]
            },
            ownedBy: { id: customer.id }
        });

        const isNewRegister = programMembershipOwnershipInfos.length === 0;

        if (isNewRegister) {
            // 新規登録時の獲得ポイント
            const membershipPointsEarned = programMembership.membershipPointsEarned;
            if (membershipPointsEarned !== undefined && membershipPointsEarned.value !== undefined) {
                // ポイント口座を検索
                const accountOwnershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>({
                    typeOfGood: {
                        typeOf: factory.ownershipInfo.AccountGoodType.Account,
                        accountType: factory.accountType.Point
                    },
                    ownedBy: { id: customer.id },
                    ownedFrom: now,
                    ownedThrough: now
                });
                if (accountOwnershipInfos.length === 0) {
                    throw new factory.errors.NotFound('accountOwnershipInfos');
                }
                const toAccount = accountOwnershipInfos[0].typeOfGood;

                await PlaceOrderService.action.authorize.award.point.create({
                    agent: { id: transaction.agent.id },
                    transaction: { id: transaction.id },
                    object: {
                        amount: Number(membershipPointsEarned.value),
                        toAccountNumber: toAccount.accountNumber,
                        notes: (typeof membershipPointsEarned.name === 'string')
                            ? membershipPointsEarned.name
                            : programMembership.programName
                    }
                })({
                    action: repos.action,
                    ownershipInfo: repos.ownershipInfo,
                    project: repos.project,
                    transaction: repos.transaction
                });
            }
        }

        // 会員プログラムオファー承認
        await PlaceOrderService.action.authorize.offer.programMembership.create({
            agentId: customer.id,
            transactionId: transaction.id,
            acceptedOffer: acceptedOffer
        })(repos);

        // 会員クレジットカード検索(事前にクレジットカードを登録しているはず)
        const gmoMemberId = (USE_USERNAME_AS_GMO_MEMBER_ID) ? customer.memberOf.membershipNumber : customer.id;
        const creditCards = await repos.creditCard.search({ personId: gmoMemberId });
        // creditCards = creditCards.filter((c) => c.defaultFlag === '1');
        const creditCard = creditCards.shift();
        if (creditCard === undefined) {
            throw new factory.errors.NotFound('CreditCard');
        }

        await CreditCardPaymentService.authorize({
            project: project,
            agent: customer,
            object: {
                typeOf: factory.paymentMethodType.CreditCard,
                amount: <number>acceptedOffer.price,
                method: GMO.utils.util.Method.Lump,
                creditCard: {
                    memberId: gmoMemberId,
                    cardSeq: Number(creditCard.cardSeq)
                }
            },
            purpose: transaction
        })(repos);

        await PlaceOrderService.updateCustomerProfile({
            id: transaction.id,
            agent: customer
        })(repos);

        // 注文配送メール送信有無
        let sendEmailMessage = false;
        if (params.sendEmailMessage === true) {
            sendEmailMessage = params.sendEmailMessage;
        } else {
            sendEmailMessage = !isNewRegister && EMAIL_INFORM_UPDATE_PROGRAMMEMBERSHIP !== undefined;
        }

        // 注文配送メールカスマイズ
        let email: factory.creativeWork.message.email.ICustomization | undefined;
        if (sendEmailMessage) {
            if (params.email !== undefined) {
                email = params.email;
            } else {
                email = {
                    about: `[${project.id}] ProgramMembership Updated`,
                    toRecipient: { name: 'administrator', email: EMAIL_INFORM_UPDATE_PROGRAMMEMBERSHIP }
                };
            }
        }

        if (params.potentialActions === undefined) {
            params.potentialActions = {};
        }
        if (params.potentialActions.order === undefined) {
            params.potentialActions.order = {};
        }
        if (params.potentialActions.order.potentialActions === undefined) {
            params.potentialActions.order.potentialActions = {};
        }
        if (params.potentialActions.order.potentialActions.sendOrder === undefined) {
            params.potentialActions.order.potentialActions.sendOrder = {};
        }
        if (params.potentialActions.order.potentialActions.sendOrder.potentialActions === undefined) {
            params.potentialActions.order.potentialActions.sendOrder.potentialActions = {};
        }
        if (!Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage)) {
            params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage = [];
        }
        if (sendEmailMessage) {
            params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage.push({
                object: email
            });
        }

        // 取引確定
        return PlaceOrderService.confirm({
            project: { typeOf: project.typeOf, id: project.id },
            id: transaction.id,
            agent: { id: customer.id },
            result: {
                order: { orderDate: new Date() }
            },
            potentialActions: params.potentialActions
            // sendEmailMessage: sendEmailMessage,
            // email: email
        })(repos);
    };
}
