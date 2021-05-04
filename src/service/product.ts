/**
 * プロダクトサービス
 */
import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as factory from '../factory';

import { createOrderProgramMembershipActionAttributes } from './product/factory';

import { handleChevreError } from '../errorHandler';

import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as TaskRepo } from '../repo/task';

import * as OfferService from './offer';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOrderTaskOperation<T> = (repos: {
    task: TaskRepo;
}) => Promise<T>;

/**
 * プロダクト注文タスクを作成する
 */
export function createOrderTask(params: {
    project: { id: string };
    agent: factory.person.IPerson;
    object: {
        typeOf: factory.chevre.offerType.Offer;
        id: string;
        itemOffered: {
            /**
             * プロダクトID
             */
            id: string;
        };
        seller: {
            typeOf: factory.chevre.organizationType;
            id: string;
        };
    };
    /**
     * 利用アプリケーション
     */
    location: { id: string };
}): ICreateOrderTaskOperation<factory.task.ITask<factory.taskName.OrderProgramMembership>> {
    return async (repos: {
        task: TaskRepo;
    }) => {
        const now = new Date();

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: params.object.seller.id });

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const product = <chevre.factory.product.IProduct>await productService.findById({ id: params.object.itemOffered.id });
        const offers = await OfferService.product.search({
            project: { id: params.project.id },
            itemOffered: { id: String(product.id) },
            seller: { id: String(seller.id) },
            availableAt: { id: params.location.id }
        })(repos);
        const acceptedOffer = offers.find((o) => o.id === params.object.id);
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        // 注文アクション属性を作成
        const data = createOrderProgramMembershipActionAttributes({
            agent: params.agent,
            offer: acceptedOffer,
            product: product,
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

/**
 * サービス登録解除
 */
export function unRegister(params: factory.action.interact.unRegister.programMembership.IAttributes) {
    return async (repos: {
        action: ActionRepo;
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
                                name: { $in: [factory.taskName.OrderProgramMembership] },
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
 * サービス登録
 */
export function registerService(params: factory.action.interact.confirm.registerService.IAttributes) {
    return async (repos: {
        action: ActionRepo;
        task: TaskRepo;
    }) => {
        // アクション開始
        const registerActionAttributes = params;
        const action = await repos.action.start(registerActionAttributes);

        try {
            const object = registerActionAttributes.object;

            const registerServiceTransaction = new chevre.service.assetTransaction.RegisterService({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            await registerServiceTransaction.confirm(object);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handleChevreError(error);

            throw error;
        }

        // アクション完了
        const result: factory.action.interact.confirm.registerService.IResult = {};
        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });

        await onRegistered(registerActionAttributes)(repos);
    };
}

export function onRegistered(
    actionAttributes: factory.action.interact.confirm.registerService.IAttributes
) {
    return async (repos: { task: TaskRepo }) => {
        const taskAttributes: factory.task.IAttributes<factory.taskName>[] = [];

        // 次のメンバーシップ注文タスクを作成
        const orderProgramMembershipTasks = actionAttributes.potentialActions?.orderProgramMembership;
        if (Array.isArray(orderProgramMembershipTasks)) {
            taskAttributes.push(...orderProgramMembershipTasks);
        }

        // タスク保管
        await Promise.all(taskAttributes.map(async (taskAttribute) => {
            return repos.task.save(taskAttribute);
        }));
    };
}
