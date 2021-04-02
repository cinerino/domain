/**
 * メンバーシップ注文サービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as moment from 'moment-timezone';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterServiceInProgressRepo } from '../../repo/action/registerServiceInProgress';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { findAccount } from '../account';
import { findCreditCard } from '../customer';
import { createPointAwardIdentifier } from '../delivery';
import * as OfferService from '../offer';
import * as ChevrePaymentService from '../payment/chevre';
import * as TransactionService from '../transaction';

import * as factory from '../../factory';

export type IOrderOperation<T> = (repos: {
    action: ActionRepo;
    confirmationNumber: ConfirmationNumberRepo;
    creditCard: CreditCardRepo;
    orderNumber: OrderNumberRepo;
    ownershipInfo: OwnershipInfoRepo;
    person: PersonRepo;
    project: ProjectRepo;
    registerActionInProgress: RegisterServiceInProgressRepo;
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
        confirmationNumber: ConfirmationNumberRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        ownershipInfo: OwnershipInfoRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: String(params.agent.id) });

        const acceptedOffer = params.object;
        const seller = <factory.seller.ISeller>acceptedOffer.itemOffered.hostingOrganization;
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
                agent: {
                    typeOf: customer.typeOf,
                    id: customer.id,
                    identifier: customer.identifier,
                    memberOf: customer.memberOf,
                    // paramsにadditionalPropertyの指定があれば反映する
                    ...(Array.isArray(params.agent.additionalProperty)) ? { additionalProperty: params.agent.additionalProperty } : []
                },
                seller: { id: String(seller.id) },
                object: {
                    customer: {
                        typeOf: customer.typeOf,
                        id: customer.id,
                        ...(Array.isArray(customer.identifier)) ? { identifier: customer.identifier } : undefined,
                        ...(typeof customer.memberOf?.typeOf === 'string') ? { memberOf: customer.memberOf } : undefined

                    }
                }
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
                    await OfferService.product.voidTransaction({
                        agent: { id: customer.id },
                        project: { typeOf: project.typeOf, id: project.id },
                        purpose: { typeOf: transaction.typeOf, id: transaction.id }
                    })(repos);
                }
            } catch (error) {
                // 失敗したら仕方ない
            }

            // 決済に関してクライアントエラーであれば、リトライしても無駄なので、正常終了
            if (error instanceof factory.errors.Argument
                && (error.argumentName === 'payment' || error.argumentName === 'ChevreArgument')) {
                return;
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
    acceptedOffer: factory.task.orderProgramMembership.IAcceptedOffer;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}) {
    return async (repos: {
        action: ActionRepo;
        confirmationNumber: ConfirmationNumberRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        // プロダクト情報取得
        const productId = acceptedOffer.itemOffered.membershipFor?.id;
        if (typeof productId !== 'string') {
            throw new Error('acceptedOffer.itemOffered.membershipFor.id undefined');
        }

        // 注文番号を先に発行
        const orderNumber = await TransactionService.placeOrderInProgress.publishOrderNumberIfNotExist({
            id: transaction.id,
            object: { orderDate: new Date() }
        })(repos);

        // メンバーシップオファー承認
        let authorizeProductOfferAction: factory.action.authorize.offer.product.IAction;
        authorizeProductOfferAction = await processAuthorizeProductOffer({
            project: { id: project.id },
            orderNumber,
            customer: customer,
            transaction: transaction,
            acceptedOffer: acceptedOffer,
            product: { id: productId }
        })(repos);

        const amount = Number(authorizeProductOfferAction.result?.price);
        if (amount > 0) {
            await processAuthorizeCreditCard({
                project: { id: project.id },
                customer: customer,
                object: { amount },
                purpose: transaction
            })(repos);
        }

        await TransactionService.updateAgent({
            typeOf: transaction.typeOf,
            id: transaction.id,
            agent: {
                typeOf: customer.typeOf,
                id: customer.id,
                email: customer.email,
                familyName: customer.familyName,
                givenName: customer.givenName,
                telephone: customer.telephone
            }
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
    orderNumber: string;
    customer: factory.person.IPerson;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    acceptedOffer: factory.task.orderProgramMembership.IAcceptedOffer;
    product: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        registerActionInProgress: RegisterServiceInProgressRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const acceptedOffer = params.acceptedOffer;
        const customer = params.customer;
        const transaction = params.transaction;

        const project: factory.chevre.project.IProject = { typeOf: factory.chevre.organizationType.Project, id: params.project.id };
        const seller: factory.order.ISeller = {
            project: project,
            typeOf: transaction.seller.typeOf,
            id: transaction.seller.id,
            name: transaction.seller.name
        };

        // オファーにポイント特典設定があるかどうか確認
        let pointAward: factory.chevre.product.IPointAward | undefined;

        const offers = await OfferService.product.search({
            project: { id: params.project.id },
            itemOffered: { id: params.product.id },
            seller: { id: String(seller.id) }
        })(repos);
        const acceptedProductOffer = offers.find((o) => o.identifier === acceptedOffer.identifier);
        if (acceptedProductOffer === undefined) {
            throw new factory.errors.NotFound('Offer', `Accepted offer ${acceptedOffer.identifier} not found`);
        }

        const pointAwardByOffer = acceptedProductOffer.itemOffered?.pointAward;
        const pointAwardAccountType = pointAwardByOffer?.amount?.currency;
        if (typeof pointAwardByOffer?.amount?.value === 'number' && typeof pointAwardAccountType === 'string') {
            const toAccount = await findAccount({
                customer: { id: params.customer.id },
                project: transaction.project,
                now: new Date(),
                accountType: pointAwardAccountType
            })(repos);

            const identifier = createPointAwardIdentifier({
                project: params.project,
                purpose: { orderNumber: params.orderNumber },
                toLocation: { accountNumber: toAccount.accountNumber }
            });

            pointAward = {
                typeOf: 'MoneyTransfer',
                toLocation: { identifier: toAccount.accountNumber },
                recipient: {
                    id: customer.id,
                    name: `${customer.givenName} ${customer.familyName}`,
                    typeOf: customer.typeOf
                },
                // ポイント特典識別子を指定(ユニークネスを保証するため)
                purpose: { identifier }
            };
        }

        const serviceOutputName: string | undefined = (typeof acceptedOffer.itemOffered.name === 'string')
            ? acceptedOffer.itemOffered.name
            : acceptedOffer.itemOffered.name?.ja;

        const object: factory.action.authorize.offer.product.IObject = [{
            project: project,
            typeOf: acceptedProductOffer.typeOf,
            id: acceptedProductOffer.id,
            priceCurrency: acceptedProductOffer.priceCurrency,
            itemOffered: {
                project: project,
                typeOf: factory.chevre.product.ProductType.MembershipService,
                id: params.product.id,
                serviceOutput: {
                    project: project,
                    typeOf: acceptedOffer.itemOffered.typeOf,
                    ...(typeof serviceOutputName === 'string') ? { name: serviceOutputName } : undefined
                    // additionalProperty: [
                    //     { name: 'sampleName', value: 'sampleValue' }
                    // ]
                },
                ...(pointAward !== undefined) ? { pointAward } : undefined
            },
            seller: seller
        }];

        // メンバーシップオファー承認
        return OfferService.product.authorize({
            project: { typeOf: factory.chevre.organizationType.Project, id: params.project.id },
            agent: { id: customer.id },
            object: object,
            transaction: { id: transaction.id }
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
        transaction: TransactionRepo;
    }) => {
        // 会員クレジットカード検索(事前にクレジットカードを登録しているはず)
        const creditCard = await findCreditCard({
            project: { id: params.project.id },
            customer: { id: params.customer.id }
        })(repos);

        await ChevrePaymentService.authorize({
            project: { id: params.project.id },
            agent: params.customer,
            object: {
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment,
                paymentMethod: factory.paymentMethodType.CreditCard,
                amount: params.object.amount,
                method: GMO.utils.util.Method.Lump,
                creditCard: {
                    memberId: creditCard.memberId,
                    cardSeq: Number(creditCard.cardSeq)
                }
            },
            purpose: params.purpose,
            paymentServiceType: factory.chevre.service.paymentService.PaymentServiceType.CreditCard
        })(repos);
    };
}
