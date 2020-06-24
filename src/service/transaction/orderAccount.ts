/**
 * 口座(Chevreプロダクト)注文サービス
 */
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
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
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    project: ProjectRepo;
    registerActionInProgress: RegisterServiceInProgressRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 口座注文
 */
export function orderAccount(params: {
    project: factory.project.IProject;
    agent: factory.ownershipInfo.IOwner;
    name: string;
    accountType: string;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    seller: { typeOf: factory.organizationType; id: string };
}): IOrderOperation<void> {
    return async (repos: {
        action: ActionRepo;
        orderNumber: OrderNumberRepo;
        ownershipInfo: OwnershipInfoRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: params.agent.id });

        // プロダクト検索
        const searchProductsResult = await productService.search({
            project: { id: { $eq: project.id } },
            typeOf: { $eq: OfferService.product.ProductType.Account }
        });
        const accountProduct = searchProductsResult.data.find((p) => p.serviceOutput?.amount?.currency === params.accountType);
        if (accountProduct === undefined) {
            throw new factory.errors.NotFound(`${params.accountType} Account Product`);
        }

        // プロダクトオファー検索
        const availableOffers = await productService.searchOffers({ id: String(accountProduct.id) });
        if (availableOffers.length > 1) {
            throw new factory.errors.NotImplemented('Available offers length greater than 1');
        }
        const acceptedOffer = availableOffers[0];
        if (acceptedOffer === undefined) {
            throw new factory.errors.NotFound('Available Offer for the product');
        }

        // 販売者を決定
        const seller = params.seller;

        let transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder> | undefined;

        try {
            // 注文取引開始
            transaction = await TransactionService.placeOrderInProgress.start({
                project: { typeOf: project.typeOf, id: project.id },
                expires: moment()
                    // tslint:disable-next-line:no-magic-numbers
                    .add(5, 'minutes')
                    .toDate(),
                agent: customer,
                seller: { typeOf: seller.typeOf, id: seller.id },
                object: {}
            })(repos);

            // 取引ID上で注文プロセス
            await processPlaceOrder({
                acceptedOffer: acceptedOffer,
                customer: customer,
                potentialActions: params.potentialActions,
                product: accountProduct,
                project: project,
                transaction: transaction
            })(repos);
        } catch (error) {
            try {
                if (typeof transaction?.id === 'string') {
                    await OfferService.product.voidTransaction({
                        agent: { id: customer.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    })(repos);
                }
            } catch (error) {
                // 失敗したら仕方ない
            }

            throw error;
        }
    };
}

/**
 * 口座を注文する
 */
function processPlaceOrder(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    product: factory.chevre.service.IService;
    acceptedOffer: factory.chevre.event.screeningEvent.ITicketOffer;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}) {
    return async (repos: {
        action: ActionRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (typeof project.settings?.chevre?.endpoint !== 'string') {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        const productService = new chevre.service.Product({
            endpoint: project.settings.chevre.endpoint,
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
            product: { id: String(params.product.id) }
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
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
        productService: chevre.service.Product;
    }) => {
        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        const project: factory.chevre.project.IProject = { typeOf: 'Project', id: params.project.id };
        const seller: factory.order.ISeller
            = { typeOf: transaction.seller.typeOf, id: transaction.seller.id, name: transaction.seller.name };

        const serviceOutputName: string | undefined = (typeof acceptedOffer.itemOffered.name === 'string')
            ? acceptedOffer.itemOffered.name
            : acceptedOffer.itemOffered.name?.ja;

        const object: factory.action.authorize.offer.product.IObject = [{
            project: project,
            typeOf: acceptedOffer.typeOf,
            id: acceptedOffer.id,
            priceCurrency: acceptedOffer.priceCurrency,
            itemOffered: {
                project: project,
                typeOf: OfferService.product.ProductType.MembershipService,
                id: params.product.id,
                serviceOutput: {
                    project: project,
                    typeOf: acceptedOffer.itemOffered.typeOf,
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
            project: { typeOf: factory.organizationType.Project, id: params.project.id },
            agent: { id: customer.id },
            object: object,
            transaction: { id: transaction.id }
        })(repos);
    };
}
