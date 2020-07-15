import * as moment from 'moment';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleChevreError } from '../../errorHandler';

import {
    availableProductTypes,
    createActionAttributes,
    createRegisterServiceStartParams,
    createResult,
    ProductType
} from './product/factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export import ProductType = ProductType;

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    ownershipInfo: OwnershipInfoRepo;
    project: ProjectRepo;
    registerActionInProgress: RegisterServiceInProgressRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * プロダクトオファーを検索する
 */
export function search(params: {
    project: { id: string };
    itemOffered: { id: string };
    seller?: { id: string };
    availableAt?: { id: string };
}) {
    return async (__: {
        project: ProjectRepo;
    }): Promise<factory.chevre.event.screeningEvent.ITicketOffer[]> => {
        const now = moment();

        let offers: factory.chevre.event.screeningEvent.ITicketOffer[] = [];

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const product = await productService.findById({ id: params.itemOffered.id });

        // 販売者指定の場合、検証
        if (typeof params.seller?.id === 'string') {
            const productOffers = product.offers;
            if (!Array.isArray(productOffers)) {
                return offers;
            }

            const hasValidOffer = productOffers.some((o) => {
                return o.seller?.id === params.seller?.id
                    && o.validFrom !== undefined
                    && moment(o.validFrom)
                        .isSameOrBefore(now)
                    && o.validThrough !== undefined
                    && moment(o.validThrough)
                        .isSameOrAfter(now);
            });
            if (!hasValidOffer) {
                return offers;
            }
        }

        offers = await productService.searchOffers({ id: String(product.id) });

        // 店舗条件によって対象を絞る
        const storeId = params.availableAt?.id;
        if (typeof storeId === 'string') {
            // アプリケーションが利用可能なオファーに絞る
            offers = offers.filter((o) => {
                return Array.isArray(o.availableAtOrFrom)
                    && o.availableAtOrFrom.some((availableApplication) => availableApplication.id === storeId);
            });
        }

        // 有効期間を適用
        offers = offers.filter((o) => {
            let isValid = true;

            if (o.validFrom !== undefined && moment(o.validFrom)
                .isAfter(now)) {
                isValid = false;
            }
            if (o.validThrough !== undefined && moment(o.validThrough)
                .isBefore(now)) {
                isValid = false;
            }

            return isValid;
        });

        return offers;
    };
}

/**
 * サービス(Chevreプロダクト)オファー承認
 */
export function authorize(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.product.IObject;
    agent: { id: string };
    /**
     * 利用アプリケーション
     */
    location?: { id?: string };
    transaction: { id: string };
}): IAuthorizeOperation<factory.action.authorize.offer.product.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
    }) => {
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const serviceOutputIdentifierService = new chevre.service.ServiceOutputIdentifier({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const product = await productService.findById({
            id: String(params.object[0]?.itemOffered?.id)
        });
        const availableOffers = await search({
            project: { id: project.id },
            itemOffered: { id: String(product.id) },
            // 利用アプリケーションを指定
            ...(typeof params.location?.id === 'string') ? { availableAt: { id: params.location.id } } : undefined
        })(repos);

        await checkIfRegistered({
            agent: { id: params.agent.id },
            product: product,
            now: now
        })(repos);

        let acceptedOffer = await validateAcceptedOffers({
            object: params.object,
            product: product,
            availableOffers: availableOffers,
            seller: transaction.seller
        })(repos);

        acceptedOffer = await createServiceOutputIdentifier({ acceptedOffer, product })({
            serviceOutputIdentifierService
        });

        let requestBody: factory.chevre.transaction.registerService.IStartParamsWithoutDetail;
        let responseBody: factory.chevre.transaction.registerService.ITransaction;

        // まず取引番号発行
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const publishResult = await transactionNumberService.publish({ project: { id: project.id } });
        const transactionNumber = publishResult.transactionNumber;

        // 承認アクション開始
        const actionAttributes = createActionAttributes({
            acceptedOffer: acceptedOffer,
            transaction: transaction,
            transactionNumber: transactionNumber
        });
        const action = await repos.action.start(actionAttributes);

        try {
            await processLock({
                agent: params.agent,
                product: product,
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            })(repos);

            // サービス登録開始
            const registerService = new chevre.service.transaction.RegisterService({
                endpoint: credentials.chevre.endpoint,
                auth: chevreAuthClient
            });

            const startParams = createRegisterServiceStartParams({
                project: { typeOf: project.typeOf, id: project.id },
                object: acceptedOffer,
                transaction: transaction,
                transactionNumber
            });
            requestBody = startParams;
            responseBody = await registerService.start(startParams);

        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            try {
                await processUnlock({
                    agent: params.agent,
                    product: { id: String(product.id) },
                    purpose: { typeOf: transaction.typeOf, id: transaction.id }
                })(repos);
            } catch (error) {
                // 失敗したら仕方ない
            }

            error = handleChevreError(error);

            throw error;
        }

        // アクションを完了
        const result = createResult({
            project: { typeOf: project.typeOf, id: project.id },
            requestBody: requestBody,
            responseBody: responseBody,
            acceptedOffer: acceptedOffer
        });

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export function voidTransaction(params: factory.task.IData<factory.taskName.VoidRegisterService>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const transaction = await repos.transaction.findById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });
        if (transaction.status !== factory.transactionStatusType.Canceled
            && transaction.status !== factory.transactionStatusType.Expired
            && transaction.status !== factory.transactionStatusType.InProgress) {
            throw new factory.errors.Argument('purpose', `invalid transaction status: ${transaction.status}`);
        }

        if (typeof params.agent?.id === 'string') {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        let authorizeActions: factory.action.authorize.offer.product.IAction[];

        if (typeof params.id === 'string') {
            const action = <factory.action.authorize.offer.product.IAction>
                await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
            if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
                throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
            }

            authorizeActions = [action];
        } else {
            authorizeActions = <factory.action.authorize.offer.product.IAction[]>
                await repos.action.searchByPurpose({
                    typeOf: factory.actionType.AuthorizeAction,
                    purpose: {
                        typeOf: params.purpose.typeOf,
                        id: params.purpose.id
                    }
                })
                    .then((actions) => actions
                        .filter((a) =>
                            Array.isArray(a.object)
                            && a.object.length > 0
                            && a.object[0].typeOf === factory.chevre.offerType.Offer
                            && availableProductTypes.indexOf(a.object[0].itemOffered.typeOf) >= 0
                        )
                    );
        }

        await Promise.all(authorizeActions.map(async (action) => {
            const productId = action.object[0]?.itemOffered?.id;
            if (typeof productId === 'string') {
                await processUnlock({
                    agent: { id: transaction.agent.id },
                    product: { id: productId },
                    purpose: params.purpose
                })(repos);
            }

            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            await processVoidRegisterServiceTransaction({
                action,
                project
            });
        }));
    };
}

/**
 * Chevre進行中取引を中止する
 */
async function processVoidRegisterServiceTransaction(params: {
    action: factory.action.authorize.offer.product.IAction;
    project: factory.project.IProject;
}) {
    const registerService = new chevre.service.transaction.RegisterService({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });

    if (typeof params.action.instrument?.transactionNumber === 'string') {
        await registerService.cancel({ transactionNumber: params.action.instrument.transactionNumber });
    }
}

/**
 * 受け入れらたオファーの内容を検証
 */
export function validateAcceptedOffers(params: {
    object: factory.action.authorize.offer.product.IObject;
    product: factory.chevre.product.IProduct;
    availableOffers: factory.chevre.event.screeningEvent.ITicketOffer[];
    seller: factory.seller.IOrganization<factory.seller.IAttributes<any>>;
}) {
    return async (__: {
    }): Promise<factory.action.authorize.offer.product.IObject> => {
        let acceptedOfferWithoutDetail = params.object;
        if (!Array.isArray(acceptedOfferWithoutDetail)) {
            acceptedOfferWithoutDetail = [acceptedOfferWithoutDetail];
        }

        if (acceptedOfferWithoutDetail.length === 0) {
            throw new factory.errors.ArgumentNull('object');
        }

        const project: factory.chevre.project.IProject = { typeOf: factory.organizationType.Project, id: params.product.project.id };
        const issuedBy: factory.chevre.organization.IOrganization = {
            project: project,
            id: params.seller.id,
            name: params.seller.name,
            typeOf: params.seller.typeOf
        };

        // 販売者を検証
        const productOffers = params.product.offers;
        if (!Array.isArray(productOffers)) {
            throw new factory.errors.Argument('Product', 'Product offers undefined');
        }
        const hasValidOffer = productOffers.some((o) => {
            return o.seller?.id === params.seller.id;
        });
        if (!hasValidOffer) {
            throw new factory.errors.Argument('Product', 'Product has no valid offer');
        }

        // 利用可能なチケットオファーであれば受け入れる
        return Promise.all(acceptedOfferWithoutDetail.map((offerWithoutDetail) => {
            const offer = params.availableOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Offer', `Offer ${offerWithoutDetail.id} not found`);
            }

            return {
                ...offerWithoutDetail,
                ...offer,
                itemOffered: {
                    project: project,
                    typeOf: params.product.typeOf,
                    id: params.product.id,
                    name: params.product.name,
                    serviceOutput: {
                        ...params.product?.serviceOutput,
                        ...offerWithoutDetail.itemOffered?.serviceOutput,
                        project: project,
                        typeOf: String(params.product?.serviceOutput?.typeOf),
                        // 発行者は販売者でいったん固定
                        issuedBy: issuedBy
                    },
                    ...(offerWithoutDetail.itemOffered?.pointAward !== undefined)
                        ? { pointAward: offerWithoutDetail.itemOffered?.pointAward }
                        : undefined
                },
                seller: { typeOf: params.seller.typeOf, id: params.seller.id, name: params.seller.name }
            };
        }));
    };
}

function checkIfRegistered(params: {
    agent: { id: string };
    product: factory.chevre.product.IProduct;
    now: Date;
}) {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const serviceOutputType = params.product.serviceOutput?.typeOf;

        // メンバーシップについては、登録済かどうか確認する
        if (params.product.typeOf === ProductType.MembershipService) {
            if (typeof serviceOutputType === 'string') {
                const ownershipInfos = await repos.ownershipInfo.search<string>({
                    typeOfGood: {
                        typeOf: serviceOutputType
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
        }
    };
}

function createServiceOutputIdentifier(params: {
    acceptedOffer: factory.action.authorize.offer.product.IObject;
    product: factory.chevre.product.IProduct;
}) {
    return async (repos: {
        serviceOutputIdentifierService: chevre.service.ServiceOutputIdentifier;
    }): Promise<factory.action.authorize.offer.product.IObject> => {
        // 識別子を発行
        return Promise.all(params.acceptedOffer.map(async (o) => {
            const { identifier } = await repos.serviceOutputIdentifierService.publish({
                project: { id: params.product.project.id }
            });

            return {
                ...o,
                itemOffered: {
                    ...o.itemOffered,
                    serviceOutput: {
                        ...o.itemOffered?.serviceOutput,
                        project: params.product.project,
                        typeOf: String(params.product.serviceOutput?.typeOf),
                        identifier: identifier
                    }
                }
            };
        }));
    };
}

function processLock(params: {
    agent: { id: string };
    product: factory.chevre.product.IProduct;
    purpose: factory.action.authorize.offer.product.IPurpose;
}) {
    return async (repos: {
        registerActionInProgress: RegisterServiceInProgressRepo;
    }) => {
        if (params.product.typeOf === ProductType.MembershipService) {
            await repos.registerActionInProgress.lock(
                {
                    agent: { id: params.agent.id },
                    product: { id: String(params.product.id) }
                },
                params.purpose.id
            );
        }
    };
}

export function processUnlock(params: {
    agent: { id: string };
    product: { id: string };
    purpose: factory.action.authorize.offer.product.IPurpose;
}) {
    return async (repos: {
        registerActionInProgress: RegisterServiceInProgressRepo;
    }) => {
        // 登録ロックIDが取引IDであればロック解除
        const holder = await repos.registerActionInProgress.getHolder({
            agent: { id: params.agent.id },
            product: { id: params.product.id }
        });

        if (holder === params.purpose.id) {
            await repos.registerActionInProgress.unlock({
                agent: { id: params.agent.id },
                product: { id: params.product.id }
            });
        }
    };
}
