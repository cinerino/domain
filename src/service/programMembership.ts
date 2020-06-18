/**
 * メンバーシップサービス
 */
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

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as factory from '../factory';

import { onRegistered } from './product';

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
        await onRegistered(action)(repos);
        // if (action.potentialActions !== undefined) {
        //     if (Array.isArray(action.potentialActions.orderProgramMembership)) {
        //         await Promise.all(action.potentialActions.orderProgramMembership.map(async (taskAttribute) => {
        //             return repos.task.save(taskAttribute);
        //         }));
        //     }
        // }
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
