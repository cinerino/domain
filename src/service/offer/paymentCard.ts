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
    acceptedOffers2amount,
    createAuthorizeActionAttributes,
    createRegisterServiceStartParams,
    responseBody2acceptedOffers4result
} from './paymentCard/factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOperation<T> = (repos: {
    accountNumber: AccountNumberRepo;
    action: ActionRepo;
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type ISelectSeatOperation<T> = () => Promise<T>;

export type IReservationFor = factory.chevre.reservation.IReservationFor<factory.chevre.reservationType.EventReservation>;
export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;
export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;
export type IMovieTicketTypeChargeSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification>;
export type IAcceptedOfferWithoutDetail4chevre = factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail4chevre;

/**
 * 決済カード承認
 */
export function authorize(params: {
    project: factory.project.IProject;
    object: any;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.paymentCard.IAction> {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        accountNumber: AccountNumberRepo;
        action: ActionRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        let product: factory.chevre.service.IService;

        if (project.settings === undefined || project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        if (params.object.length === 0) {
            throw new factory.errors.ArgumentNull('object');
        }

        product = await productService.findById({
            id: params.object[0]?.itemOffered?.id
        });

        const accountType = (<any>product).serviceOutput?.typeOf;
        if (typeof accountType !== 'string') {
            throw new factory.errors.ServiceUnavailable('Account type unknown');
        }

        let acceptedOffer = await validateAcceptedOffers({
            project: project,
            object: params.object,
            product: product,
            seller: transaction.seller
        })(repos);

        // カード番号を発行
        acceptedOffer = await Promise.all(acceptedOffer.map(async (o) => {
            const accountNumber = await repos.accountNumber.publish(new Date());

            return {
                ...o,
                itemOffered: {
                    ...o.itemOffered,
                    serviceOutput: {
                        ...o.itemOffered?.serviceOutput,
                        identifier: accountNumber
                    }
                }
            };
        }));

        let requestBody: any;
        let responseBody: any;
        let acceptedOffers4result: any[] = [];

        // Chevre予約の場合、まず予約取引開始
        if (project.settings?.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        // 承認アクションを開始
        const actionAttributes = createAuthorizeActionAttributes({
            acceptedOffer: acceptedOffer,
            // pendingTransaction: reserveTransaction,
            transaction: transaction
        });
        const action = await repos.action.start(actionAttributes);

        // サービス登録開始
        try {
            const registerService = new chevre.service.transaction.RegisterService({
                endpoint: project.settings.chevre.endpoint,
                auth: chevreAuthClient
            });

            const startParams = createRegisterServiceStartParams({
                project: { typeOf: project.typeOf, id: project.id },
                object: acceptedOffer,
                transaction: transaction
            });
            requestBody = startParams;
            responseBody = await registerService.start(startParams);

            // 座席仮予約からオファー情報を生成する
            acceptedOffers4result = responseBody2acceptedOffers4result({
                responseBody: responseBody,
                project: { typeOf: project.typeOf, id: project.id },
                seller: transaction.seller,
                acceptedOffer: acceptedOffer
            });
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

        // 金額計算
        const amount = acceptedOffers2amount({ acceptedOffers: acceptedOffers4result });

        // アクションを完了
        const result: factory.action.authorize.offer.paymentCard.IResult = {
            price: amount,
            priceCurrency: factory.chevre.priceCurrency.JPY,
            ...{
                requestBody: requestBody,
                responseBody: responseBody,
                acceptedOffers: acceptedOffers4result
            }
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 受け入れらたオファーの内容を検証
 */
export function validateAcceptedOffers(params: {
    project: factory.project.IProject;
    object: any;
    product: any;
    seller: { typeOf: factory.organizationType; id: string };
}) {
    return async (__: {
        project: ProjectRepo;
        seller: SellerRepo;
    }): Promise<factory.action.authorize.offer.paymentCard.IObject> => {
        if (typeof params.project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }
        const productService = new chevre.service.Product({
            endpoint: params.project.settings?.chevre?.endpoint,
            auth: chevreAuthClient
        });

        // 利用可能なオファー
        const availableOffers = await productService.searchOffers({ id: String(params.product.id) });

        let acceptedOfferWithoutDetail: any[] = params.object;
        if (!Array.isArray(acceptedOfferWithoutDetail)) {
            acceptedOfferWithoutDetail = [acceptedOfferWithoutDetail];
        }

        // 利用可能なチケットオファーであれば受け入れる
        return Promise.all(acceptedOfferWithoutDetail.map((offerWithoutDetail) => {
            const offer = availableOffers.find((o) => o.id === offerWithoutDetail.id);
            if (offer === undefined) {
                throw new factory.errors.NotFound('Offer', `Offer ${offerWithoutDetail.id} not found`);
            }

            return {
                ...offerWithoutDetail,
                ...offer,
                itemOffered: {
                    ...params.product,
                    // serviceType: acceptedOfferWithoutDetail.itemOffered?.serviceType,
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
