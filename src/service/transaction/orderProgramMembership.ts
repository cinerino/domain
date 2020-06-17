/**
 * メンバーシップ注文サービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { findAccount } from '../account';
import { findCreditCard } from '../customer';
import * as OfferService from '../offer';
import * as CreditCardPaymentService from '../payment/creditCard';
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
    creditCard: CreditCardRepo;
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    project: ProjectRepo;
    registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

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
        const project = await repos.project.findById({ id: params.project.id });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: params.agent.id });

        const acceptedOffer = params.object;
        const seller = <factory.seller.IOrganization<any>>acceptedOffer.itemOffered.hostingOrganization;
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

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
                project: project,
                transaction: transaction
            })(repos);
        } catch (error) {
            try {
                if (typeof transaction?.id === 'string') {
                    await OfferService.programMembership.voidTransaction({
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
 * メンバーシップを注文する
 */
function processPlaceOrder(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    /**
     * メンバーシップオファー
     */
    acceptedOffer: factory.action.interact.register.programMembership.IAcceptedOffer;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}) {
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
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

        // プロダクト情報取得
        const productId = acceptedOffer.itemOffered.membershipFor?.id;
        if (typeof productId !== 'string') {
            throw new Error('membershipServiceId undefined');
        }

        // メンバーシップオファー承認
        const authorizeMembershipOfferAction = await processAuthorizeMembershipOffer({
            project: { id: project.id },
            customer: customer,
            transaction: transaction,
            acceptedOffer: acceptedOffer,
            product: { id: productId }
        })({
            ...repos,
            productService: productService
        });

        await processAuthorizeCreditCard({
            project: { id: project.id },
            customer: customer,
            object: { amount: <number>authorizeMembershipOfferAction.result?.price },
            purpose: transaction
        })(repos);

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

// プログラム更新の場合、管理者宛のメール送信を自動設定
// const emailInformUpdateProgrammembership = (typeof project.settings?.emailInformUpdateProgrammembership === 'string')
//     ? project.settings?.emailInformUpdateProgrammembership
//     : undefined;

// 新規登録かどうか、所有権で確認
// const programMembershipOwnershipInfos =
//     await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType.ProgramMembership>({
//         limit: 1,
//         typeOfGood: {
//             typeOf: <any>membershipService.serviceOutput?.typeOf
//         },
//         ownedBy: { id: customer.id }
//     });
// const isNewRegister = programMembershipOwnershipInfos.length === 0;

// let sendEmailMessageParams = params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.sendEmailMessage;
// if (!Array.isArray(sendEmailMessageParams)) {
//     sendEmailMessageParams = [];
// }

// if (!isNewRegister
//     && typeof emailInformUpdateProgrammembership === 'string'
//     && sendEmailMessageParams.length === 0) {
//     const email: factory.creativeWork.message.email.ICustomization = {
//         about: `ProgramMembership Renewed [${project.id}]`,
//         toRecipient: { name: 'administrator', email: emailInformUpdateProgrammembership }
//         // template: template
//     };

//     sendEmailMessageParams.push({
//         object: email
//     });
// }

function processAuthorizeMembershipOffer(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    acceptedOffer: factory.action.interact.register.programMembership.IAcceptedOffer;
    product: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        registerActionInProgressRepo: RegisterProgramMembershipInProgressRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
        productService: chevre.service.Product;
    }) => {
        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        // オファーにポイント特典設定があるかどうか確認
        const offers = await repos.productService.searchOffers({ id: params.product.id });
        const acceptedProductOffer = offers.find((o) => o.identifier === acceptedOffer.identifier);
        if (acceptedProductOffer === undefined) {
            throw new factory.errors.NotFound('Offer', `Accepted offer ${acceptedOffer.identifier} not found`);
        }
        const pointAwardByOffer = acceptedProductOffer.itemOffered?.pointAward;
        if (typeof pointAwardByOffer?.amount?.value === 'number' && typeof pointAwardByOffer?.amount?.currency === 'string') {
            const toAccount = await findAccount({
                customer: { id: params.customer.id },
                project: transaction.project,
                now: new Date(),
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
        }

        // メンバーシップオファー承認
        return OfferService.programMembership.authorize({
            project: { typeOf: factory.organizationType.Project, id: params.project.id },
            agent: { id: customer.id },
            object: acceptedOffer,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        })(repos);
    };
}

function processAuthorizeCreditCard(params: {
    project: { id: string };
    customer: factory.person.IPerson;
    object: { amount: number };
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        person: PersonRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        // 会員クレジットカード検索(事前にクレジットカードを登録しているはず)
        const creditCard = await findCreditCard({
            project: { id: params.project.id },
            customer: { id: params.customer.id }
        })(repos);

        await CreditCardPaymentService.authorize({
            project: { id: params.project.id },
            agent: params.customer,
            object: {
                typeOf: factory.paymentMethodType.CreditCard,
                amount: params.object.amount,
                method: GMO.utils.util.Method.Lump,
                creditCard: {
                    memberId: creditCard.memberId,
                    cardSeq: Number(creditCard.cardSeq)
                }
            },
            purpose: params.purpose
        })(repos);
    };
}
