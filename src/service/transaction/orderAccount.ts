/**
 * 口座(Chevreプロダクト)注文サービス
 */
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as OfferService from '../offer';
import * as TransactionService from '../transaction';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export type IOrderOperation<T> = (repos: {
    action: ActionRepo;
    confirmationNumber: ConfirmationNumberRepo;
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    project: ProjectRepo;
    registerActionInProgress: RegisterServiceInProgressRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 口座注文
 * 通貨がaccountTypeの口座を注文する処理
 */
export function orderAccount(params: {
    project: factory.project.IProject;
    agent: factory.ownershipInfo.IOwner;
    name: string;
    accountType: string;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    /**
     * 利用アプリケーション
     */
    location: { id: string };
}): IOrderOperation<factory.transaction.placeOrder.IResult> {
    return async (repos: {
        action: ActionRepo;
        confirmationNumber: ConfirmationNumberRepo;
        orderNumber: OrderNumberRepo;
        ownershipInfo: OwnershipInfoRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: String(params.agent.id) });

        // プロダクト検索
        const searchProductsResult = await productService.search({
            project: { id: { $eq: project.id } },
            typeOf: { $in: [chevre.factory.product.ProductType.PaymentCard] }
        });
        const accountProduct = (<chevre.factory.product.IProduct[]>searchProductsResult.data)
            .find((p) => p.serviceOutput?.amount?.currency === params.accountType);
        if (accountProduct === undefined) {
            throw new factory.errors.NotFound(`${params.accountType} Account Product`);
        }

        // プロダクトオファー検索
        const availableOffers = await OfferService.product.search({
            project: { id: project.id },
            itemOffered: { id: String(accountProduct.id) },
            availableAt: { id: params.location.id }
        })(repos);
        if (availableOffers.length > 1) {
            throw new factory.errors.NotImplemented('Available offers length greater than 1');
        }
        const acceptedOffer = availableOffers[0];
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Available Offer for the product');
        }

        // 販売者を決定
        // プロダクトのひとつめの販売者を自動選択
        const productOffers = accountProduct.offers;
        if (!Array.isArray(productOffers) || productOffers.length === 0) {
            throw new factory.errors.NotFound('Product offers');
        }
        const productOfferSellerId = productOffers.shift()?.seller?.id;
        if (typeof productOfferSellerId !== 'string') {
            throw new factory.errors.NotFound('seller of product offer');
        }

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: productOfferSellerId });

        let transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder> | undefined;

        // 注文取引開始
        transaction = await TransactionService.placeOrderInProgress.start({
            project: { typeOf: project.typeOf, id: project.id },
            expires: moment()
                // tslint:disable-next-line:no-magic-numbers
                .add(5, 'minutes')
                .toDate(),
            agent: customer,
            seller: { id: String(seller.id) },
            object: {}
        })(repos);

        // 取引ID上で注文プロセス
        return processPlaceOrder({
            acceptedOffer: acceptedOffer,
            customer: customer,
            potentialActions: params.potentialActions,
            product: accountProduct,
            project: project,
            transaction: transaction,
            serviceOutputName: params.name,
            location: params.location
        })(repos);
    };
}

/**
 * 口座を注文する
 */
function processPlaceOrder(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    product: factory.chevre.product.IProduct;
    acceptedOffer: factory.chevre.event.screeningEvent.ITicketOffer;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    serviceOutputName?: string;
    /**
     * 利用アプリケーション
     */
    location: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        confirmationNumber: ConfirmationNumberRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        // プロダクトオファー承認
        await processAuthorizeProductOffer({
            project: { id: project.id },
            customer: customer,
            transaction: transaction,
            acceptedOffer: acceptedOffer,
            product: { id: String(params.product.id) },
            serviceOutputName: params.serviceOutputName,
            location: params.location
        })({
            ...repos,
            productService: productService
        });

        await TransactionService.updateAgent({
            typeOf: transaction.typeOf,
            id: transaction.id,
            agent: customer
        })(repos);

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

function processAuthorizeProductOffer(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    acceptedOffer: factory.chevre.event.screeningEvent.ITicketOffer;
    product: { id: string };
    serviceOutputName?: string;
    /**
     * 利用アプリケーション
     */
    location: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
        productService: chevre.service.Product;
    }) => {
        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        const project: factory.chevre.project.IProject = { typeOf: factory.chevre.organizationType.Project, id: params.project.id };
        const seller: factory.order.ISeller
            = { project: project, typeOf: transaction.seller.typeOf, id: transaction.seller.id, name: transaction.seller.name };

        // 口座名称はユーザーネーム
        const serviceOutputName: string | undefined = (typeof params.serviceOutputName === 'string')
            ? params.serviceOutputName
            : customer.memberOf?.membershipNumber;

        const object: factory.action.authorize.offer.product.IObject = [{
            project: project,
            typeOf: acceptedOffer.typeOf,
            id: acceptedOffer.id,
            priceCurrency: acceptedOffer.priceCurrency,
            itemOffered: {
                project: project,
                typeOf: factory.chevre.product.ProductType.MembershipService,
                id: params.product.id,
                serviceOutput: {
                    project: project,
                    typeOf: acceptedOffer.itemOffered.typeOf,
                    accessCode: (typeof customer.telephone === 'string')
                        // tslint:disable-next-line:no-magic-numbers
                        ? customer.telephone.slice(-4)
                        : '9999',
                    ...(typeof serviceOutputName === 'string') ? { name: serviceOutputName } : undefined
                    // additionalProperty: [
                    //     { name: 'sampleName', value: 'sampleValue' }
                    // ]
                }
            },
            seller: seller
        }];

        // メンバーシップオファー承認
        return OfferService.product.authorize({
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            agent: { id: customer.id },
            object: object,
            location: params.location,
            transaction: { id: transaction.id }
        })(repos);
    };
}
