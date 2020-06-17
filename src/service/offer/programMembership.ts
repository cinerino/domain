/**
 * メンバーシップオファーサービス
 */
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { createActionAttributes, createRegisterServiceStartParams } from './programMembership/factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    ownershipInfo: OwnershipInfoRepo;
    project: ProjectRepo;
    registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export function authorize(params: {
    project: factory.project.IProject;
    agent: { id: string };
    object: factory.action.authorize.offer.programMembership.IObject;
    purpose: factory.action.authorize.offer.programMembership.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.offer.programMembership.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
        registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const membershipServiceId = params.object.itemOffered.membershipFor?.id;
        if (typeof membershipServiceId !== 'string') {
            throw new factory.errors.ArgumentNull('object.itemOffered.membershipFor.id');
        }

        // プロダクト検索
        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const membershipService = await productService.findById({ id: membershipServiceId });
        const offers = await productService.searchOffers({ id: String(membershipService.id) });
        const acceptedOffer = offers.find((o) => o.identifier === params.object.identifier);
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Offer');
        }

        await checkIfRegistered({
            agent: { id: params.agent.id },
            product: membershipService,
            now: now
        })(repos);

        // 金額計算
        if (acceptedOffer.priceSpecification.typeOf !== factory.chevre.priceSpecificationType.CompoundPriceSpecification) {
            throw new factory.errors.ServiceUnavailable('price specification of result accepted offer must be CompoundPriceSpecification');
        }
        const priceSpecification = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>acceptedOffer.priceSpecification;
        const amount = priceSpecification.priceComponent.reduce((a2, b2) => a2 + Number(b2.price), 0);

        // 在庫確認は現時点で不要
        // 何かしらメンバーシップへの登録に制約を設けたい場合は、ここに処理を追加するとよいかと思われます。
        // まず取引番号発行
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const publishResult = await transactionNumberService.publish({ project: { id: project.id } });
        const transactionNumber = publishResult.transactionNumber;

        // 承認アクションを開始
        const actionAttributes = createActionAttributes({
            project: { typeOf: project.typeOf, id: project.id },
            transaction: transaction,
            acceptedOffer: acceptedOffer,
            product: membershipService,
            transactionNumber: transactionNumber
        });
        const action = await repos.action.start(actionAttributes);

        try {
            // 登録処理ロック
            // 進行中であれば競合エラー
            await repos.registerActionInProgressRepo.lock(
                {
                    id: params.agent.id,
                    programMembershipId: String(membershipService.id)
                },
                transaction.id
            );

            // Chevreでサービス登録取引
            const registerServiceTransaction = new chevre.service.transaction.RegisterService({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            let pointAward: factory.chevre.service.IPointAward | undefined;
            if ((<any>params.object.itemOffered).pointAward !== undefined) {
                pointAward = (<any>params.object.itemOffered).pointAward;
            }

            const startParams = createRegisterServiceStartParams({
                project: { typeOf: project.typeOf, id: project.id },
                transaction: transaction,
                acceptedOffer: acceptedOffer,
                product: membershipService,
                transactionNumber: transactionNumber,
                pointAward: pointAward
            });
            await registerServiceTransaction.start(startParams);
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            try {
                // 登録ロックIDが取引IDであればロック解除
                const holder = await repos.registerActionInProgressRepo.getHolder({
                    id: params.agent.id,
                    programMembershipId: String(membershipService.id)
                });

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (holder === transaction.id) {
                    await repos.registerActionInProgressRepo.unlock({
                        id: params.agent.id,
                        programMembershipId: String(membershipService.id)
                    });
                }
            } catch (error) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        const result: factory.action.authorize.offer.programMembership.IResult = {
            price: amount,
            priceCurrency: <factory.chevre.priceCurrency>acceptedOffer.priceSpecification?.priceCurrency
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

function checkIfRegistered(params: {
    agent: { id: string };
    product: factory.chevre.service.IService;
    now: Date;
}) {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const serviceOutputType = params.product.serviceOutput?.typeOf;

        if (typeof serviceOutputType === 'string') {
            const ownershipInfos = await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType>({
                typeOfGood: {
                    typeOf: <any>serviceOutputType
                },
                ownedBy: { id: params.agent.id },
                ownedFrom: params.now,
                ownedThrough: params.now
            });

            const selectedProgramMembership = ownershipInfos.find((o) => o.typeOfGood.membershipFor?.id === params.product.id);
            if (selectedProgramMembership !== undefined) {
                // Already registered
                throw new factory.errors.Argument('object', 'Already registered');
            }
        }
    };
}

/**
 * 承認アクションをキャンセルする
 */
export function voidTransaction(params: {
    agentId: string;
    transactionId: string;
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
    };
}
