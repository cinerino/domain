/**
 * メンバーシップサービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../repo/action/registerProgramMembershipInProgress';
import { MongoRepository as OrderRepo } from '../repo/order';
import { RedisRepository as OrderNumberRepo } from '../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../repo/person';
import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as SellerRepo } from '../repo/seller';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as AccountService from './account';
import * as OfferService from './offer';
import * as CreditCardPaymentService from './payment/creditCard';
import * as TransactionService from './transaction';

import { credentials } from '..//credentials';

import * as chevre from '../chevre';
import * as factory from '../factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateRegisterTaskOperation<T> = (repos: {
    project: ProjectRepo;
    seller: SellerRepo;
    task: TaskRepo;
}) => Promise<T>;

export type IOrderOperation<T> = (repos: {
    action: ActionRepo;
    creditCard: CreditCardRepo;
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    project: ProjectRepo;
    registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type IRegisterOperation<T> = (repos: {
    action: ActionRepo;
    order: OrderRepo;
    person: PersonRepo;
    project: ProjectRepo;
    task: TaskRepo;
}) => Promise<T>;

/**
 * メンバーシップ登録タスクを作成する
 */
export function createRegisterTask(params: {
    project: { id: string };
    agent: factory.person.IPerson;
    /**
     * メンバーシップのオファー識別子
     */
    offerIdentifier: string;
    /**
     * プロダクトID
     */
    programMembershipId: string;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: {
        typeOf: factory.organizationType;
        id: string;
    };
}): ICreateRegisterTaskOperation<factory.task.ITask<factory.taskName.OrderProgramMembership>> {
    return async (repos: {
        project: ProjectRepo;
        seller: SellerRepo;
        task: TaskRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const membershipService = await productService.findById({ id: params.programMembershipId });
        const offers = await productService.searchOffers({ id: String(membershipService.id) });
        const acceptedOffer = offers.find((o) => o.identifier === params.offerIdentifier);
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        const seller = await repos.seller.findById({ id: params.seller.id });

        // 注文アクション属性を作成
        const data = createOrderProgramMembershipActionAttributes({
            agent: params.agent,
            offer: acceptedOffer,
            programMembership: membershipService,
            potentialActions: params.potentialActions,
            seller: seller
        });

        // メンバーシップ注文タスクを作成する
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
    programMembership: factory.chevre.service.IService;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;
}): factory.task.IData<factory.taskName.OrderProgramMembership> {
    const offer = params.offer;
    const programMembership = params.programMembership;
    const seller = params.seller;

    const itemOffered: factory.programMembership.IProgramMembership = {
        project: { typeOf: factory.organizationType.Project, id: programMembership.project.id },
        typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership,
        name: <any>programMembership.name,
        // programName: <any>programMembership.name,
        // メンバーシップのホスト組織確定(この組織が決済対象となる)
        hostingOrganization: {
            project: { typeOf: 'Project', id: seller.project.id },
            id: seller.id,
            typeOf: seller.typeOf
        },
        membershipFor: {
            typeOf: 'MembershipService',
            id: <string>programMembership.id
        }
    };

    // 受け入れれたオファーオブジェクトを作成
    const acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership> = {
        project: { typeOf: seller.project.typeOf, id: seller.project.typeOf },
        typeOf: factory.chevre.offerType.Offer,
        identifier: offer.identifier,
        // price: offer.priceSpecification?.price,
        priceCurrency: offer.priceCurrency,
        priceSpecification: offer.priceSpecification,
        itemOffered: itemOffered,
        seller: {
            typeOf: seller.typeOf,
            name: (typeof seller.name === 'string')
                ? seller.name
                : String(seller.name?.ja)
        }
    };

    return {
        agent: params.agent,
        object: acceptedOffer,
        potentialActions: params.potentialActions,
        project: { typeOf: factory.organizationType.Project, id: programMembership.project.id },
        typeOf: factory.actionType.OrderAction
    };
}

/**
 * メンバーシップ注文
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
        const membershipService = acceptedOffer.itemOffered.membershipFor;
        if (typeof membershipService?.id !== 'string') {
            throw new factory.errors.ArgumentNull('MembershipService ID');
        }

        const seller = programMembership.hostingOrganization;
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

        const programMemberships = await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType>({
            typeOfGood: {
                typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership
            },
            ownedBy: { id: customer.id },
            ownedFrom: now,
            ownedThrough: now
        });
        // すでにメンバーシップに加入済であれば何もしない
        const selectedProgramMembership = programMemberships.find((p) => p.typeOfGood.membershipFor?.id === membershipService.id);
        if (selectedProgramMembership !== undefined) {
            // Already registered

            return;
        }

        let lockNumber: number | undefined;
        try {
            // 登録処理を進行中に変更。進行中であれば競合エラー。
            lockNumber = await repos.registerActionInProgressRepo.lock(
                {
                    id: customer.id,
                    programMembershipId: membershipService.id
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
                        programMembershipId: membershipService.id
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
 * メンバーシップ登録
 * 登録アクションの後で、次回のメンバーシップ注文タスクを作成する
 */
export function register(
    params: factory.task.IData<factory.taskName.RegisterProgramMembership>
): IRegisterOperation<void> {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        person: PersonRepo;
        project: ProjectRepo;
        task: TaskRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        await repos.person.findById({
            userId: params.agent.id
        });

        const programMembership = params.object;
        if (programMembership.typeOf !== factory.chevre.programMembership.ProgramMembershipType.ProgramMembership) {
            throw new factory.errors.Argument('Object', 'Object type must be ProgramMembership');
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof programMembership.membershipFor?.id !== 'string') {
            throw new factory.errors.ArgumentNull('MembershipService ID');
        }

        const order = await repos.order.findByOrderNumber({ orderNumber: (<any>params).purpose?.orderNumber });

        // アクション開始
        const registerActionAttibutes: factory.action.interact.register.programMembership.IAttributes = params;
        const action = <factory.action.interact.register.programMembership.IAction>await repos.action.start(registerActionAttibutes);

        try {
            // Chevreサービス登録取引確定
            const transactionNumber = (<any>registerActionAttibutes.object).transactionNumber;
            if (typeof transactionNumber === 'string') {
                if (typeof project.settings?.chevre?.endpoint !== 'string') {
                    throw new factory.errors.ServiceUnavailable('Project settings not found');
                }

                const registerServiceTransaction = new chevre.service.transaction.RegisterService({
                    endpoint: project.settings.chevre.endpoint,
                    auth: chevreAuthClient
                });

                await registerServiceTransaction.confirm({
                    transactionNumber: transactionNumber,
                    endDate: order.orderDate
                });
            }
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

        // 次のメンバーシップ注文タスクを作成
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
 * メンバーシップ登録解除
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
            const membershipServiceId = params.object.membershipFor?.id;
            if (typeof membershipServiceId === 'string') {
                if (Array.isArray(params.object.member)) {
                    const customers = params.object.member;

                    await Promise.all(customers.map(async (customer) => {
                        // メンバーシップ更新タスク(継続課金タスク)をキャンセル
                        await repos.task.taskModel.findOneAndUpdate(
                            {
                                // 旧メンバーシップ注文タスクへの互換性維持
                                name: { $in: [factory.taskName.OrderProgramMembership, factory.taskName.RegisterProgramMembership] },
                                'data.agent.id': {
                                    $exists: true,
                                    $eq: customer.id
                                },
                                'data.object.itemOffered.membershipFor.id': {
                                    $exists: true,
                                    $eq: membershipServiceId
                                },
                                status: factory.taskStatus.Ready
                            },
                            { status: factory.taskStatus.Aborted }
                        )
                            .exec();

                        // 現在所有しているメンバーシップを全て検索
                        const now = moment(action.startDate)
                            .toDate();
                        const ownershipInfos = await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType>({
                            typeOfGood: {
                                typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership
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
 * メンバーシップを注文する
 */
function processPlaceOrder(params: {
    /**
     * メンバーシップオファー
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
        seller: SellerRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const acceptedOffer = params.acceptedOffer;
        const programMembership = acceptedOffer.itemOffered;
        const customer = params.customer;
        const seller = params.seller;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (customer.memberOf === undefined || customer.memberOf.membershipNumber === undefined) {
            throw new factory.errors.NotFound('Customer MembershipNumber');
        }

        // メンバーシップ注文取引進行
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

        // 最新のプログラム情報を取得
        const membershipServiceId = programMembership.membershipFor?.id;
        if (typeof membershipServiceId !== 'string') {
            throw new Error('membershipServiceId undefined');
        }

        const membershipService = await productService.findById({ id: membershipServiceId });

        // オファーにポイント特典設定があるかどうか確認
        const offers = await productService.searchOffers({ id: String(membershipService.id) });
        const acceptedProductOffer = offers.find((o) => o.identifier === acceptedOffer.identifier);
        if (acceptedProductOffer === undefined) {
            throw new factory.errors.NotFound('Offer', `Accepted offer ${acceptedOffer.identifier} not found`);
        }
        const pointAwardByOffer = acceptedProductOffer.itemOffered?.pointAward;
        if (typeof pointAwardByOffer?.amount?.value === 'number' && typeof pointAwardByOffer?.amount?.currency === 'string') {
            const toAccount = await findAccount({
                customer: params.customer,
                transaction: transaction,
                now: now,
                accountType: pointAwardByOffer.amount?.currency
            })(repos);

            acceptedOffer.itemOffered = {
                ...acceptedOffer.itemOffered,
                ...{
                    pointAward: {
                        toLocation: { identifier: toAccount.accountNumber },
                        recipient: {
                            id: customer.id,
                            name: `${customer.givenName} ${customer.familyName}`,
                            typeOf: customer.typeOf
                        }
                    }
                }
            };
        } else {
            // ポイント特典承認
            await processAuthorizePointAward({
                customer: customer,
                membershipService: membershipService,
                transaction: transaction,
                now: now
            })(repos);
        }

        // メンバーシップオファー承認
        const authorizeProgramMembershipOfferResult = await OfferService.programMembership.authorize({
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
                amount: <number>authorizeProgramMembershipOfferResult.result?.price,
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

        // プログラム更新の場合、管理者宛のメール送信を自動設定
        const emailInformUpdateProgrammembership = (typeof project.settings?.emailInformUpdateProgrammembership === 'string')
            ? project.settings?.emailInformUpdateProgrammembership
            : undefined;

        // 新規登録かどうか、所有権で確認
        const programMembershipOwnershipInfos =
            await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType.ProgramMembership>({
                limit: 1,
                typeOfGood: {
                    typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership
                },
                ownedBy: { id: customer.id }
            });

        const isNewRegister = programMembershipOwnershipInfos.length === 0;

        let sendEmailMessageParams = params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.sendEmailMessage;
        if (!Array.isArray(sendEmailMessageParams)) {
            sendEmailMessageParams = [];
        }

        if (!isNewRegister
            && typeof emailInformUpdateProgrammembership === 'string'
            && sendEmailMessageParams.length === 0) {
            const email: factory.creativeWork.message.email.ICustomization = {
                about: `ProgramMembership Renewed [${project.id}]`,
                toRecipient: { name: 'administrator', email: emailInformUpdateProgrammembership }
                // template: template
            };

            sendEmailMessageParams.push({
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

function processAuthorizePointAward(params: {
    customer: factory.person.IPerson;
    membershipService: factory.chevre.service.IService;
    transaction: factory.transaction.placeOrder.ITransaction;
    now: Date;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const membershipService = params.membershipService;
        const transaction = params.transaction;

        // 登録時の獲得ポイント
        let pointAward = (<any>membershipService).pointAward;
        if (pointAward !== undefined && !Array.isArray(pointAward)) {
            pointAward = [pointAward];
        }
        // if (Array.isArray(pointAward)) {
        //     const givePointAwardParams: factory.transaction.placeOrder.IGivePointAwardParams[] = [];

        //     await Promise.all((pointAward)
        //         .map(async () => {
        //             // no op
        //         }));

        //     await TransactionService.placeOrderInProgress.authorizeAward({
        //         agent: { id: transaction.agent.id },
        //         transaction: { id: transaction.id },
        //         object: {
        //             potentialActions: {
        //                 givePointAwardParams: givePointAwardParams
        //             }
        //         }
        //     })({
        //         action: repos.action,
        //         transaction: repos.transaction
        //     });
        // }

        let membershipServiceOutput = membershipService.serviceOutput;
        // 元々配列型だったので、互換性維持対応として
        if (!Array.isArray(membershipServiceOutput)) {
            membershipServiceOutput = <any>[membershipServiceOutput];
        }

        if (Array.isArray(membershipServiceOutput)) {
            const givePointAwardParams: factory.transaction.placeOrder.IGivePointAwardParams[] = [];

            await Promise.all((<factory.chevre.programMembership.IProgramMembership[]>membershipServiceOutput)
                .map(async (serviceOutput) => {
                    const membershipPointsEarnedName = (<any>serviceOutput).membershipPointsEarned?.name;
                    const membershipPointsEarnedValue = serviceOutput.membershipPointsEarned?.value;
                    const membershipPointsEarnedUnitText = (<any>serviceOutput).membershipPointsEarned?.unitText;

                    if (typeof membershipPointsEarnedValue === 'number' && typeof membershipPointsEarnedUnitText === 'string') {
                        const toAccount = await findAccount({
                            customer: params.customer,
                            transaction: params.transaction,
                            now: params.now,
                            accountType: membershipPointsEarnedUnitText
                        })(repos);

                        givePointAwardParams.push({
                            object: {
                                typeOf: factory.action.authorize.award.point.ObjectType.PointAward,
                                amount: membershipPointsEarnedValue,
                                toLocation: {
                                    accountType: membershipPointsEarnedUnitText,
                                    accountNumber: toAccount.accountNumber
                                },
                                description: (typeof membershipPointsEarnedName === 'string')
                                    ? membershipPointsEarnedName
                                    : membershipService.typeOf
                            }
                        });
                    }
                }));

            await TransactionService.placeOrderInProgress.authorizeAward({
                agent: { id: transaction.agent.id },
                transaction: { id: transaction.id },
                object: {
                    potentialActions: {
                        givePointAwardParams: givePointAwardParams
                    }
                }
            })({
                action: repos.action,
                transaction: repos.transaction
            });
        }
    };
}

function findAccount(params: {
    customer: factory.person.IPerson;
    transaction: factory.transaction.placeOrder.ITransaction;
    now: Date;
    accountType: string;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }): Promise<factory.pecorino.account.IAccount> => {
        // 所有口座を検索
        // 最も古い所有口座をデフォルト口座として扱う使用なので、ソート条件はこの通り
        let accountOwnershipInfos = await AccountService.search({
            project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
            conditions: {
                sort: { ownedFrom: factory.sortType.Ascending },
                limit: 1,
                typeOfGood: {
                    typeOf: factory.ownershipInfo.AccountGoodType.Account,
                    accountType: params.accountType
                },
                ownedBy: { id: params.customer.id },
                ownedFrom: params.now,
                ownedThrough: params.now
            }
        })({
            ownershipInfo: repos.ownershipInfo,
            project: repos.project
        });

        // 開設口座に絞る
        accountOwnershipInfos =
            accountOwnershipInfos.filter((o) => o.typeOfGood.status === factory.pecorino.accountStatusType.Opened);
        if (accountOwnershipInfos.length === 0) {
            throw new factory.errors.NotFound('accountOwnershipInfos');
        }

        return accountOwnershipInfos[0].typeOfGood;
    };
}
