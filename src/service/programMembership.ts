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

import * as OfferService from './offer';
import * as CreditCardPaymentService from './payment/creditCard';
import * as TransactionService from './transaction';

import * as factory from '../factory';

export type ICreateRegisterTaskOperation<T> = (repos: {
    programMembership: ProgramMembershipRepo;
    seller: SellerRepo;
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
         */
        typeOf: factory.organizationType;
        /**
         * 販売者ID
         */
        id: string;
    };
}): ICreateRegisterTaskOperation<factory.task.ITask<factory.taskName.OrderProgramMembership>> {
    return async (repos: {
        programMembership: ProgramMembershipRepo;
        seller: SellerRepo;
        task: TaskRepo;
    }) => {
        const now = new Date();

        const programMembership = await repos.programMembership.findById({ id: params.programMembershipId });

        if (programMembership.offers === undefined) {
            throw new factory.errors.NotFound('ProgramMembership.offers');
        }

        const offer = programMembership.offers.find((o) => o.identifier === params.offerIdentifier);
        if (offer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        const seller = await repos.seller.findById({ id: params.seller.id });

        // 注文アクション属性を作成
        const data = createOrderProgramMembershipActionAttributes({
            agent: params.agent,
            offer: offer,
            programMembership: programMembership,
            potentialActions: params.potentialActions,
            seller: seller
        });

        // 会員プログラム注文タスクを作成する
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

function createOrderProgramMembershipActionAttributes(params: {
    agent: factory.person.IPerson;
    offer: factory.offer.IOffer;
    programMembership: factory.programMembership.IProgramMembership;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;
}): factory.task.IData<factory.taskName.OrderProgramMembership> {
    const offer = params.offer;
    const programMembership = params.programMembership;
    const seller = params.seller;

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembership.offers === undefined) {
        throw new factory.errors.NotFound('ProgramMembership.offers');
    }

    // 会員プログラムのホスト組織確定(この組織が決済対象となる)
    programMembership.hostingOrganization = {
        project: seller.project,
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
        offers: programMembership.offers
    };

    // 受け入れれたオファーオブジェクトを作成
    const acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership> = {
        project: { typeOf: seller.project.typeOf, id: seller.project.typeOf },
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

    return {
        agent: params.agent,
        object: acceptedOffer,
        potentialActions: params.potentialActions,
        project: programMembership.project,
        typeOf: factory.actionType.OrderAction
    };
}

/**
 * 会員プログラム注文
 */
export function orderProgramMembership(
    params: factory.task.IData<factory.taskName.OrderProgramMembership>
): IOrderOperation<void> {
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

        const project = await repos.project.findById({ id: params.project.id });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: params.agent.id });

        const acceptedOffer = params.object;

        const programMembership = acceptedOffer.itemOffered;
        if (programMembership.id === undefined) {
            throw new factory.errors.ArgumentNull('ProgramMembership ID');
        }

        const seller = programMembership.hostingOrganization;
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

        const programMemberships = await repos.ownershipInfo.search<factory.programMembership.ProgramMembershipType>({
            typeOfGood: {
                typeOf: factory.programMembership.ProgramMembershipType.ProgramMembership,
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
        //         typeOf: factory.programMembership.ProgramMembershipType.ProgramMembership,
        //         ids: [programMembership.id]
        //     },
        //     ownedBy: { id: customer.id }
        // });
        // const isNewRegister = programMembershipOwnershipInfos.length === 0;

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
                seller: seller
            })(repos);
        } catch (error) {
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
    };
}

/**
 * 会員プログラム登録
 * 登録アクションの後で、次回の会員プログラム注文タスクを作成する
 */
export function register(
    params: factory.task.IData<factory.taskName.RegisterProgramMembership>
): IRegisterOperation<void> {
    return async (repos: {
        action: ActionRepo;
        person: PersonRepo;
        task: TaskRepo;
    }) => {
        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        await repos.person.findById({
            userId: params.agent.id
        });

        const acceptedOffer = params.object;
        if (acceptedOffer.typeOf !== factory.programMembership.ProgramMembershipType.ProgramMembership) {
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
 * 会員プログラム登録解除
 */
export function unRegister(params: factory.action.interact.unRegister.programMembership.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        ownershipInfo: OwnershipInfoRepo;
        task: TaskRepo;
    }) => {
        const returnedOwnershipInfos: factory.ownershipInfo.IOwnershipInfo<any>[] = [];

        // アクション開始
        const action = await repos.action.start(params);

        try {
            const programMembershipId = params.object.id;
            if (programMembershipId !== undefined) {
                if (Array.isArray(params.object.member)) {
                    const customers = params.object.member;

                    await Promise.all(customers.map(async (customer) => {
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

                        // 現在所有している会員プログラムを全て検索
                        const now = moment(action.startDate)
                            .toDate();
                        const ownershipInfos = await repos.ownershipInfo.search<factory.programMembership.ProgramMembershipType>({
                            typeOfGood: {
                                typeOf: factory.programMembership.ProgramMembershipType.ProgramMembership,
                                id: programMembershipId
                            },
                            ownedBy: { id: customer.id },
                            ownedFrom: now,
                            ownedThrough: now
                        });

                        // 所有権の期限変更
                        await Promise.all(ownershipInfos.map(async (ownershipInfo) => {
                            const doc = await repos.ownershipInfo.ownershipInfoModel.findOneAndUpdate(
                                { _id: ownershipInfo.id },
                                { ownedThrough: now },
                                { new: true }
                            )
                                .select({ __v: 0, createdAt: 0, updatedAt: 0 })
                                .exec();
                            if (doc !== null) {
                                returnedOwnershipInfos.push(doc.toObject());
                            }
                        }));
                    }));
                }
            }
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
        const actionResult: factory.action.interact.unRegister.programMembership.IResult = returnedOwnershipInfos;
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

        const project = await repos.project.findById({ id: params.project.id });

        const acceptedOffer = params.acceptedOffer;
        const programMembership = acceptedOffer.itemOffered;
        const customer = params.customer;
        const seller = params.seller;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (customer.memberOf === undefined || customer.memberOf.membershipNumber === undefined) {
            throw new factory.errors.NotFound('Customer MembershipNumber');
        }

        // 会員プログラム注文取引進行
        const transaction = await TransactionService.placeOrderInProgress.start({
            project: { typeOf: project.typeOf, id: project.id },
            expires: moment()
                // tslint:disable-next-line:no-magic-numbers
                .add(5, 'minutes')
                .toDate(),
            agent: customer,
            seller: { typeOf: seller.typeOf, id: seller.id },
            object: {}
        })(repos);

        // 新規登録時の獲得ポイント
        const membershipPointsEarned = programMembership.membershipPointsEarned;
        if (membershipPointsEarned !== undefined && membershipPointsEarned.value !== undefined) {
            // ポイント口座を検索
            const accountOwnershipInfos = await repos.ownershipInfo.search<factory.ownershipInfo.AccountGoodType.Account>({
                // 最も古い所有口座をデフォルト口座として扱う使用なので、ソート条件はこの通り
                sort: { ownedFrom: factory.sortType.Ascending },
                limit: 1,
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

            await TransactionService.placeOrderInProgress.action.authorize.award.point.create({
                agent: { id: transaction.agent.id },
                transaction: { id: transaction.id },
                object: {
                    typeOf: factory.action.authorize.award.point.ObjectType.PointAward,
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

        // 会員プログラムオファー承認
        await OfferService.programMembership.authorize({
            project: { typeOf: project.typeOf, id: project.id },
            agent: { id: customer.id },
            object: acceptedOffer,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        })(repos);

        // 会員クレジットカード検索(事前にクレジットカードを登録しているはず)
        const useUsernameAsGMOMemberId = project.settings !== undefined && project.settings.useUsernameAsGMOMemberId === true;
        const gmoMemberId = (useUsernameAsGMOMemberId) ? customer.memberOf.membershipNumber : customer.id;
        const creditCards = await repos.creditCard.search({ personId: gmoMemberId });
        // creditCards = creditCards.filter((c) => c.defaultFlag === '1');
        const creditCard = creditCards.shift();
        if (creditCard === undefined) {
            throw new factory.errors.NotFound('CreditCard');
        }

        await CreditCardPaymentService.authorize({
            project: { id: project.id },
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

        await TransactionService.updateAgent({
            typeOf: transaction.typeOf,
            id: transaction.id,
            agent: customer
        })(repos);

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

        // プログラム更新の場合、管理者宛のメール送信を自動設定
        const emailInformUpdateProgrammembership =
            (project.settings !== undefined && typeof project.settings.emailInformUpdateProgrammembership === 'string')
                ? project.settings.emailInformUpdateProgrammembership
                : undefined;

        // 新規登録かどうか、所有権で確認
        const programMembershipOwnershipInfos =
            await repos.ownershipInfo.search<factory.programMembership.ProgramMembershipType.ProgramMembership>({
                limit: 1,
                typeOfGood: {
                    typeOf: factory.programMembership.ProgramMembershipType.ProgramMembership,
                    ids: [<string>programMembership.id]
                },
                ownedBy: { id: customer.id }
            });

        const isNewRegister = programMembershipOwnershipInfos.length === 0;

        if (!isNewRegister
            && emailInformUpdateProgrammembership !== undefined
            && params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage.length === 0) {
            const email: factory.creativeWork.message.email.ICustomization = {
                about: `ProgramMembership Renewed [${project.id}]`,
                toRecipient: { name: 'administrator', email: emailInformUpdateProgrammembership }
                // template: template
            };

            params.potentialActions.order.potentialActions.sendOrder.potentialActions.sendEmailMessage.push({
                object: email
            });
        }

        // 取引確定
        return TransactionService.placeOrderInProgress.confirm({
            project: { id: project.id },
            id: transaction.id,
            agent: { id: customer.id },
            result: {
                order: { orderDate: new Date() }
            },
            potentialActions: params.potentialActions
        })(repos);
    };
}
