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
// tslint:disable-next-line:max-func-body-length
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
        const now = new Date();

        const project = await repos.project.findById({ id: params.project.id });

        // ユーザー存在確認(管理者がマニュアルでユーザーを削除する可能性があるので)
        const customer = await repos.person.findById({ userId: params.agent.id });

        const acceptedOffer = params.object;

        const programMembership = acceptedOffer.itemOffered;
        const membershipService = acceptedOffer.itemOffered.membershipFor;
        if (typeof membershipService?.id !== 'string') {
            throw new factory.errors.ArgumentNull('MembershipService ID');
        }

        const seller = <factory.seller.IOrganization<any>>programMembership.hostingOrganization;
        if (seller === undefined) {
            throw new factory.errors.NotFound('ProgramMembership HostingOrganization');
        }

        const programMemberships = await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType>({
            typeOfGood: {
                typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership
            },
            ownedBy: { id: customer.id },
            ownedFrom: now,
            ownedThrough: now
        });
        // すでにメンバーシップに加入済であれば何もしない
        const selectedProgramMembership = programMemberships.find((p) => p.typeOfGood.membershipFor?.id === membershipService.id);
        if (selectedProgramMembership !== undefined) {
            // Already registered

            return;
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

            // 登録処理を進行中に変更。進行中であれば競合エラー。
            await repos.registerActionInProgressRepo.lock(
                {
                    id: customer.id,
                    programMembershipId: membershipService.id
                },
                transaction.id
            );

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
                // 登録ロックIDが取引IDであればロック解除
                // 本プロセスがlockした場合は解除する。解除しなければタスクのリトライが無駄になってしまう。
                const holder = await repos.registerActionInProgressRepo.getHolder({
                    id: customer.id,
                    programMembershipId: membershipService.id
                });

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (typeof transaction?.id === 'string' && holder === transaction.id) {
                    await repos.registerActionInProgressRepo.unlock({
                        id: customer.id,
                        programMembershipId: membershipService.id
                    });
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
    /**
     * メンバーシップオファー
     */
    acceptedOffer: factory.action.interact.register.programMembership.IAcceptedOffer;
    /**
     * 購入者
     */
    customer: factory.person.IPerson;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    /**
     * プロジェクト
     */
    project: factory.project.IProject;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
}) {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    return async (repos: {
        action: ActionRepo;
        creditCard: CreditCardRepo;
        orderNumber: OrderNumberRepo;
        person: PersonRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
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

        const acceptedOffer = params.acceptedOffer;
        const programMembership = acceptedOffer.itemOffered;
        const customer = params.customer;
        const transaction = params.transaction;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (customer.memberOf === undefined || customer.memberOf.membershipNumber === undefined) {
            throw new factory.errors.NotFound('Customer MembershipNumber');
        }

        // 最新のプログラム情報を取得
        const membershipServiceId = programMembership.membershipFor?.id;
        if (typeof membershipServiceId !== 'string') {
            throw new Error('membershipServiceId undefined');
        }

        const membershipService = await productService.findById({ id: membershipServiceId });

        // オファーにポイント特典設定があるかどうか確認
        const offers = await productService.searchOffers({ id: String(membershipService.id) });
        const acceptedProductOffer = offers.find((o) => o.identifier === acceptedOffer.identifier);
        if (acceptedProductOffer === undefined) {
            throw new factory.errors.NotFound('Offer', `Accepted offer ${acceptedOffer.identifier} not found`);
        }
        const pointAwardByOffer = acceptedProductOffer.itemOffered?.pointAward;
        if (typeof pointAwardByOffer?.amount?.value === 'number' && typeof pointAwardByOffer?.amount?.currency === 'string') {
            const toAccount = await findAccount({
                customer: { id: params.customer.id },
                project: transaction.project,
                now: now,
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
        } else {
            // ポイント特典承認
            await processAuthorizePointAward({
                customer: customer,
                membershipService: membershipService,
                transaction: transaction,
                now: now
            })(repos);
        }

        // メンバーシップオファー承認
        const authorizeProgramMembershipOfferResult = await OfferService.programMembership.authorize({
            project: { typeOf: project.typeOf, id: project.id },
            agent: { id: customer.id },
            object: acceptedOffer,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        })(repos);

        // 会員クレジットカード検索(事前にクレジットカードを登録しているはず)
        const useUsernameAsGMOMemberId = project.settings !== undefined && project.settings.useUsernameAsGMOMemberId === true;
        const gmoMemberId = (useUsernameAsGMOMemberId) ? customer.memberOf.membershipNumber : customer.id;
        const creditCards = await repos.creditCard.search({ personId: gmoMemberId });
        // creditCards = creditCards.filter((c) => c.defaultFlag === '1');
        const creditCard = creditCards.shift();
        if (creditCard === undefined) {
            throw new factory.errors.NotFound('CreditCard');
        }

        await CreditCardPaymentService.authorize({
            project: { id: project.id },
            agent: customer,
            object: {
                typeOf: factory.paymentMethodType.CreditCard,
                amount: <number>authorizeProgramMembershipOfferResult.result?.price,
                method: GMO.utils.util.Method.Lump,
                creditCard: {
                    memberId: gmoMemberId,
                    cardSeq: Number(creditCard.cardSeq)
                }
            },
            purpose: transaction
        })(repos);

        await TransactionService.updateAgent({
            typeOf: transaction.typeOf,
            id: transaction.id,
            agent: customer
        })(repos);

        // プログラム更新の場合、管理者宛のメール送信を自動設定
        const emailInformUpdateProgrammembership = (typeof project.settings?.emailInformUpdateProgrammembership === 'string')
            ? project.settings?.emailInformUpdateProgrammembership
            : undefined;

        // 新規登録かどうか、所有権で確認
        const programMembershipOwnershipInfos =
            await repos.ownershipInfo.search<factory.chevre.programMembership.ProgramMembershipType.ProgramMembership>({
                limit: 1,
                typeOfGood: {
                    typeOf: factory.chevre.programMembership.ProgramMembershipType.ProgramMembership
                },
                ownedBy: { id: customer.id }
            });

        const isNewRegister = programMembershipOwnershipInfos.length === 0;

        let sendEmailMessageParams = params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.sendEmailMessage;
        if (!Array.isArray(sendEmailMessageParams)) {
            sendEmailMessageParams = [];
        }

        if (!isNewRegister
            && typeof emailInformUpdateProgrammembership === 'string'
            && sendEmailMessageParams.length === 0) {
            const email: factory.creativeWork.message.email.ICustomization = {
                about: `ProgramMembership Renewed [${project.id}]`,
                toRecipient: { name: 'administrator', email: emailInformUpdateProgrammembership }
                // template: template
            };

            sendEmailMessageParams.push({
                object: email
            });
        }

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

function processAuthorizePointAward(params: {
    customer: factory.person.IPerson;
    membershipService: factory.chevre.service.IService;
    transaction: factory.transaction.placeOrder.ITransaction;
    now: Date;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const membershipService = params.membershipService;
        const transaction = params.transaction;

        let membershipServiceOutput = membershipService.serviceOutput;
        // 元々配列型だったので、互換性維持対応として
        if (!Array.isArray(membershipServiceOutput)) {
            membershipServiceOutput = <any>[membershipServiceOutput];
        }

        if (Array.isArray(membershipServiceOutput)) {
            const givePointAwardParams: factory.transaction.placeOrder.IGivePointAwardParams[] = [];

            await Promise.all((<factory.chevre.programMembership.IProgramMembership[]>membershipServiceOutput)
                .map(async (serviceOutput) => {
                    const membershipPointsEarnedName = (<any>serviceOutput).membershipPointsEarned?.name;
                    const membershipPointsEarnedValue = serviceOutput.membershipPointsEarned?.value;
                    const membershipPointsEarnedUnitText = (<any>serviceOutput).membershipPointsEarned?.unitText;

                    if (typeof membershipPointsEarnedValue === 'number' && typeof membershipPointsEarnedUnitText === 'string') {
                        const toAccount = await findAccount({
                            customer: { id: params.customer.id },
                            project: transaction.project,
                            now: params.now,
                            accountType: membershipPointsEarnedUnitText
                        })(repos);

                        givePointAwardParams.push({
                            object: {
                                typeOf: factory.action.authorize.award.point.ObjectType.PointAward,
                                amount: membershipPointsEarnedValue,
                                toLocation: {
                                    accountType: membershipPointsEarnedUnitText,
                                    accountNumber: toAccount.accountNumber
                                },
                                description: (typeof membershipPointsEarnedName === 'string')
                                    ? membershipPointsEarnedName
                                    : membershipService.typeOf
                            }
                        });
                    }
                }));

            await TransactionService.placeOrderInProgress.authorizeAward({
                agent: { id: transaction.agent.id },
                transaction: { id: transaction.id },
                object: {
                    potentialActions: {
                        givePointAwardParams: givePointAwardParams
                    }
                }
            })({
                action: repos.action,
                transaction: repos.transaction
            });
        }
    };
}
