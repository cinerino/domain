import { credentials } from '../../credentials';

import * as chevre from '../../chevre';

import * as factory from '../../factory';

import { RedisRepository as AccountNumberRepo } from '../../repo/accountNumber';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleChevreError } from '../../errorHandler';

import {
    createActionAttributes,
    createRegisterServiceStartParams,
    createResult
} from './product/factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IAuthorizeOperation<T> = (repos: {
    accountNumber: AccountNumberRepo;
    action: ActionRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * サービス(Chevreプロダクト)オファー承認
 */
export function authorize(params: {
    project: factory.project.IProject;
    object: any;
    agent: { id: string };
    transaction: { id: string };
}): IAuthorizeOperation<factory.action.authorize.offer.paymentCard.IAction> {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        accountNumber: AccountNumberRepo;
        action: ActionRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const product = await productService.findById({
            id: params.object[0]?.itemOffered?.id
        });
        const availableOffers = await productService.searchOffers({ id: String(product.id) });

        let acceptedOffer = await validateAcceptedOffers({
            object: params.object,
            product: product,
            availableOffers: availableOffers,
            seller: transaction.seller
        })(repos);

        acceptedOffer = await createServiceOutputIdentifier({ acceptedOffer, product })(repos);

        let requestBody: factory.chevre.transaction.registerService.IStartParamsWithoutDetail;
        let responseBody: factory.chevre.transaction.registerService.ITransaction;

        // まず取引番号発行
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: project.settings.chevre.endpoint,
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
            // サービス登録開始
            const registerService = new chevre.service.transaction.RegisterService({
                endpoint: project.settings.chevre.endpoint,
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

/**
 * 受け入れらたオファーの内容を検証
 */
export function validateAcceptedOffers(params: {
    object: any;
    product: factory.chevre.service.IService;
    availableOffers: factory.chevre.event.screeningEvent.ITicketOffer[];
    seller: { typeOf: factory.organizationType; id: string };
}) {
    return async (__: {
    }): Promise<factory.action.authorize.offer.paymentCard.IObject> => {
        let acceptedOfferWithoutDetail: any[] = params.object;
        if (!Array.isArray(acceptedOfferWithoutDetail)) {
            acceptedOfferWithoutDetail = [acceptedOfferWithoutDetail];
        }

        if (acceptedOfferWithoutDetail.length === 0) {
            throw new factory.errors.ArgumentNull('object');
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
                    typeOf: params.product.typeOf,
                    id: params.product.id,
                    name: params.product.name,
                    serviceOutput: {
                        ...params.product?.serviceOutput,
                        ...offerWithoutDetail.itemOffered?.serviceOutput
                    }
                },
                seller: { typeOf: params.seller.typeOf, id: params.seller.id }
            };
        }));
    };
}

function createServiceOutputIdentifier(params: {
    acceptedOffer: factory.action.authorize.offer.paymentCard.IObject;
    product: factory.chevre.service.IService;
}) {
    return async (repos: {
        accountNumber: AccountNumberRepo;
    }): Promise<factory.action.authorize.offer.paymentCard.IObject> => {
        // カード番号を発行
        return Promise.all(params.acceptedOffer.map(async (o) => {
            const accountNumber = await repos.accountNumber.publish(new Date());

            return {
                ...o,
                itemOffered: {
                    ...o.itemOffered,
                    serviceOutput: {
                        ...o.itemOffered?.serviceOutput,
                        project: params.product.project,
                        typeOf: String(params.product.serviceOutput?.typeOf),
                        identifier: accountNumber
                    }
                }
            };
        }));
    };
}
