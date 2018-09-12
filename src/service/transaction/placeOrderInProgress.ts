/**
 * 進行中注文取引サービス
 */
import * as waiter from '@waiter/domain';
import * as createDebug from 'debug';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment-timezone';
import * as pug from 'pug';
import * as util from 'util';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as AuthorizePointAwardActionService from './placeOrderInProgress/action/authorize/award/point';
import * as SeatReservationAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/seatReservation';
import * as AuthorizeAccountPaymentActionService from './placeOrderInProgress/action/authorize/paymentMethod/account';
import * as CreditCardAuthorizeActionService from './placeOrderInProgress/action/authorize/paymentMethod/creditCard';
import * as MocoinAuthorizeActionService from './placeOrderInProgress/action/authorize/paymentMethod/mocoin';

const debug = createDebug('cinerino-domain:service');

export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type IOrganizationAndTransactionAndTransactionCountOperation<T> = (repos: {
    organization: OrganizationRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 取引開始パラメーターインターフェース
 */
export interface IStartParams {
    /**
     * 取引期限
     */
    expires: Date;
    /**
     * 消費者
     */
    customer: factory.person.IPerson;
    /**
     * 販売者
     */
    seller: {
        typeOf: factory.organizationType;
        id: string;
    };
    /**
     * APIクライアント
     */
    clientUser: factory.clientUser.IClientUser;
    /**
     * WAITER許可証トークン
     */
    passportToken?: waiter.factory.passport.IEncodedPassport;
}

/**
 * 取引開始
 */
export function start(params: IStartParams):
    IOrganizationAndTransactionAndTransactionCountOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        organization: OrganizationRepo;
        transaction: TransactionRepo;
    }) => {
        // 売り手を取得
        const seller = await repos.organization.findById({ typeOf: params.seller.typeOf, id: params.seller.id });

        let passport: waiter.factory.passport.IPassport | undefined;

        // WAITER許可証トークンがあれば検証する
        if (params.passportToken !== undefined) {
            try {
                passport = await waiter.service.passport.verify(params.passportToken, <string>process.env.WAITER_SECRET);
            } catch (error) {
                throw new factory.errors.Argument('passportToken', `Invalid token. ${error.message}`);
            }

            // スコープを判別
            if (!validatePassport(passport, seller.id)) {
                throw new factory.errors.Argument('passportToken', 'Invalid passport.');
            }
        } else {
            // tslint:disable-next-line:no-suspicious-comment
            // TODO いったん許可証トークンなしでも通過するようにしているが、これでいいのかどうか。保留事項。
            // throw new factory.errors.ArgumentNull('passportToken');
            params.passportToken = moment().valueOf().toString(); // ユニークインデックスがDBにはられているため
            passport = <any>{};
        }

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const transactionAttributes: factory.transaction.placeOrder.IAttributes = {
            typeOf: factory.transactionType.PlaceOrder,
            status: factory.transactionStatusType.InProgress,
            agent: params.customer,
            seller: seller,
            object: {
                passportToken: params.passportToken,
                passport: <any>passport,
                clientUser: params.clientUser,
                authorizeActions: []
            },
            expires: params.expires,
            startDate: new Date(),
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        };

        let transaction: factory.transaction.placeOrder.ITransaction;
        try {
            transaction = await repos.transaction.start(factory.transactionType.PlaceOrder, transactionAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 許可証を重複使用しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error collection: development-v2.transactions...',
                // code: 11000,

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['passportToken'], 'Passport already used.');
                }
            }

            throw error;
        }

        return transaction;
    };
}

/**
 * WAITER許可証の有効性チェック
 * @param passport WAITER許可証
 * @param sellerIdentifier 販売者識別子
 */
function validatePassport(passport: waiter.factory.passport.IPassport, sellerIdentifier: string) {
    // スコープのフォーマットは、placeOrderTransaction.{sellerId}
    const explodedScopeStrings = passport.scope.split('.');

    return (
        passport.iss === <string>process.env.WAITER_PASSPORT_ISSUER && // 許可証発行者確認
        // tslint:disable-next-line:no-magic-numbers
        explodedScopeStrings.length === 2 &&
        explodedScopeStrings[0] === 'placeOrderTransaction' && // スコープ接頭辞確認
        explodedScopeStrings[1] === sellerIdentifier // 販売者識別子確認
    );
}

/**
 * 取引に対するアクション
 */
export namespace action {
    /**
     * 取引に対する承認アクション
     */
    export namespace authorize {
        export namespace award {
            export import point = AuthorizePointAwardActionService;
        }
        export namespace discount {
        }
        export namespace offer {
            /**
             * 座席予約承認アクションサービス
             */
            export import seatReservation = SeatReservationAuthorizeActionService;
        }
        export namespace paymentMethod {
            /**
             * 口座承認アクションサービス
             */
            export import account = AuthorizeAccountPaymentActionService;
            /**
             * クレジットカード承認アクションサービス
             */
            export import creditCard = CreditCardAuthorizeActionService;
            /**
             * Mocoin承認アクションサービス
             */
            export import mocoin = MocoinAuthorizeActionService;
        }
    }
}

/**
 * 取引中の購入者情報を変更する
 */
export function setCustomerContact(params: {
    agentId: string;
    transactionId: string;
    contact: factory.transaction.placeOrder.ICustomerContact;
}): ITransactionOperation<factory.transaction.placeOrder.ICustomerContact> {
    return async (repos: { transaction: TransactionRepo }) => {
        let formattedTelephone: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.contact.telephone, 'JP'); // 日本の電話番号前提仕様
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('invalid phone number format.');
            }

            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('contact.telephone', error.message);
        }

        // 連絡先を再生成(validationの意味も含めて)
        const customerContact: factory.transaction.placeOrder.ICustomerContact = {
            familyName: params.contact.familyName,
            givenName: params.contact.givenName,
            email: params.contact.email,
            telephone: formattedTelephone
        };

        const transaction = await repos.transaction.findInProgressById(factory.transactionType.PlaceOrder, params.transactionId);

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        await repos.transaction.setCustomerContactOnPlaceOrderInProgress(params.transactionId, customerContact);

        return customerContact;
    };
}

/**
 * 注文取引を確定する
 */
export function confirm(params: {
    /**
     * 取引進行者ID
     */
    agentId: string;
    /**
     * 取引ID
     */
    transactionId: string;
    /**
     * 注文メールを送信するかどうか
     */
    sendEmailMessage?: boolean;
    /**
     * 注文日時
     */
    orderDate: Date;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        organization: OrganizationRepo;
        orderNumber: OrderNumberRepo;
        confirmationNumber: ConfirmationNumberRepo;
    }) => {
        let transaction = await repos.transaction.findById(factory.transactionType.PlaceOrder, params.transactionId);
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return <factory.transaction.placeOrder.IResult>transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transactionId', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
        }

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        const seller = await repos.organization.findById({
            typeOf: <factory.organizationType.MovieTheater>transaction.seller.typeOf,
            id: transaction.seller.id
        });
        debug('seller found.', seller.id);

        const customerContact = transaction.object.customerContact;
        if (customerContact === undefined) {
            throw new factory.errors.Argument('Customer contact required');
        }

        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.findAuthorizeByTransactionId({ transactionId: params.transactionId });
        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.orderDate));
        transaction.object.authorizeActions = authorizeActions;

        // 取引の確定条件が全て整っているかどうか確認
        validateTransaction(transaction);

        // 注文番号を発行
        const orderNumber = await repos.orderNumber.publish({
            orderDate: params.orderDate,
            sellerType: seller.typeOf,
            sellerBranchCode: seller.location.branchCode
        });
        const confirmationNumber = await repos.confirmationNumber.publish({
            orderDate: params.orderDate
        });
        // 結果作成
        const order = createOrderFromTransaction({
            transaction: transaction,
            orderNumber: orderNumber,
            confirmationNumber: confirmationNumber,
            orderDate: params.orderDate,
            orderStatus: factory.orderStatus.OrderProcessing,
            isGift: false,
            seller: seller
        });
        const result: factory.transaction.placeOrder.IResult = {
            order: order
        };

        // ポストアクションを作成
        const potentialActions = await createPotentialActionsFromTransaction({
            transaction: transaction,
            customerContact: customerContact,
            order: order,
            seller: seller,
            sendEmailMessage: params.sendEmailMessage
        });

        // ステータス変更
        debug('updating transaction...');
        transaction = await repos.transaction.confirmPlaceOrder(
            params.transactionId,
            authorizeActions,
            result,
            potentialActions
        );

        return <factory.transaction.placeOrder.IResult>transaction.result;
    };
}

/**
 * 取引が確定可能な状態かどうかをチェックする
 */
export function validateTransaction(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;
    let priceByAgent = 0;
    let priceBySeller = 0;

    // クレジットカードオーソリを確認
    const creditCardAuthorizeActions = authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard);
    priceByAgent += creditCardAuthorizeActions.reduce(
        (a, b) => a + (<factory.action.authorize.paymentMethod.creditCard.IResult>b.result).price, 0
    );

    // コインオーソリを確認
    const authorizeCoinActions = authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment)
        .filter((a) => a.object.accountType === factory.accountType.Coin);
    priceByAgent += authorizeCoinActions.reduce(
        (a, b) => a + (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType.Coin>>b.result).amount, 0
    );

    // ポイントインセンティブは複数可だが、現時点で1注文につき1ポイントに限定
    const pointAwardAuthorizeActions = <factory.action.authorize.award.point.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);
    const givenAmount = pointAwardAuthorizeActions.reduce((a, b) => a + b.object.amount, 0);
    if (givenAmount > 1) {
        throw new factory.errors.Argument('transactionId', 'Incentive amount must be 1');
    }

    const seatReservationAuthorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
    if (seatReservationAuthorizeActions.length > 1) {
        throw new factory.errors.Argument('transactionId', 'The number of seat reservation authorize actions must be one');
    }
    priceBySeller += seatReservationAuthorizeActions.reduce(
        (a, b) => a + (<factory.action.authorize.offer.seatReservation.IResult>b.result).price, 0
    );

    // ポイント鑑賞券によって必要なポイントがどのくらいあるか算出
    let requiredPoint = 0;
    const seatReservationAuthorizeAction = seatReservationAuthorizeActions.shift();
    if (seatReservationAuthorizeAction !== undefined) {
        requiredPoint = (<factory.action.authorize.offer.seatReservation.IResult>seatReservationAuthorizeAction.result).point;
        // 必要ポイントがある場合、Pecorinoのオーソリ金額と比較
        if (requiredPoint > 0) {
            const authorizedPointAmount =
                (<factory.action.authorize.paymentMethod.account.IAction<factory.accountType.Point>[]>authorizeActions)
                    .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                    .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment)
                    .filter((a) => a.object.accountType === factory.accountType.Point)
                    .reduce((a, b) => a + b.object.amount, 0);
            if (requiredPoint !== authorizedPointAmount) {
                throw new factory.errors.Argument('transactionId', 'Required point amount not satisfied');
            }
        }
    }

    // JPYオーソリ金額もオーソリポイントも0より大きくなければ取引成立不可
    if (priceByAgent < 0 && requiredPoint < 0) {
        throw new factory.errors.Argument('transactionId', 'Price or point must be over 0');
    }
    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('transactionId', 'Transaction cannot be confirmed because prices are not matched');
    }
}

/**
 * 取引オブジェクトから注文オブジェクトを生成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrderFromTransaction(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    orderNumber: string;
    confirmationNumber: number;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
    seller: factory.organization.movieTheater.IOrganization;
}): factory.order.IOrder {
    // 座席予約に対する承認アクション取り出す
    const seatReservationAuthorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
    if (seatReservationAuthorizeActions.length > 1) {
        throw new factory.errors.NotImplemented('Number of seat reservation authorizeAction must be 1.');
    }
    const seatReservationAuthorizeAction = seatReservationAuthorizeActions.shift();
    // if (seatReservationAuthorizeAction === undefined) {
    //     throw new factory.errors.Argument('transaction', 'Seat reservation does not exist.');
    // }

    // 会員プログラムに対する承認アクションを取り出す
    const programMembershipAuthorizeActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered.typeOf === 'ProgramMembership');
    if (programMembershipAuthorizeActions.length > 1) {
        throw new factory.errors.NotImplemented('Number of programMembership authorizeAction must be 1.');
    }
    const programMembershipAuthorizeAction = programMembershipAuthorizeActions.shift();
    // if (seatReservationAuthorizeAction === undefined) {
    //     throw new factory.errors.Argument('transaction', 'Seat reservation does not exist.');
    // }

    if (params.transaction.object.customerContact === undefined) {
        throw new factory.errors.Argument('transaction', 'Customer contact does not exist');
    }

    const cutomerContact = params.transaction.object.customerContact;
    const seller: factory.order.ISeller = {
        id: params.transaction.seller.id,
        name: params.transaction.seller.name.ja,
        legalName: params.transaction.seller.legalName,
        typeOf: params.transaction.seller.typeOf,
        telephone: params.transaction.seller.telephone,
        url: params.transaction.seller.url
    };
    const customer: factory.order.ICustomer = {
        ...{
            id: params.transaction.agent.id,
            typeOf: params.transaction.agent.typeOf,
            name: `${cutomerContact.familyName} ${cutomerContact.givenName}`,
            url: ''
        },
        ...params.transaction.object.customerContact
    };
    if (params.transaction.agent.memberOf !== undefined) {
        customer.memberOf = params.transaction.agent.memberOf;
    }

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];
    // 座席予約がある場合
    if (seatReservationAuthorizeAction !== undefined) {
        if (seatReservationAuthorizeAction.result === undefined) {
            throw new factory.errors.Argument('transaction', 'Seat reservation result does not exist.');
        }
        const reserveTransaction = seatReservationAuthorizeAction.result.responseBody;
        const screeningEvent = reserveTransaction.object.reservations[0].reservationFor;
        // 座席仮予約からオファー情報を生成する
        acceptedOffers.push(...reserveTransaction.object.reservations.map((tmpReserve) => {
            return {
                typeOf: <factory.offer.OfferType>'Offer',
                itemOffered: tmpReserve,
                price: tmpReserve.price,
                priceCurrency: factory.priceCurrency.JPY,
                seller: {
                    typeOf: params.seller.typeOf,
                    name: screeningEvent.superEvent.location.name.ja
                }
            };
        }));
    }

    // 会員プログラムがある場合
    if (programMembershipAuthorizeAction !== undefined) {
        acceptedOffers.push(programMembershipAuthorizeAction.object);
    }

    // 結果作成
    const discounts: factory.order.IDiscount[] = [];
    // params.transaction.object.authorizeActions
    //     .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
    //     .filter((a) => a.object.typeOf === factory.action.authorize.discount.mvtk.ObjectType.Mvtk)
    //     .forEach((mvtkAuthorizeAction: factory.action.authorize.discount.mvtk.IAction) => {
    //         const discountCode = mvtkAuthorizeAction.object.seatInfoSyncIn.knyknrNoInfo.map(
    //             (knshInfo) => knshInfo.knyknrNo
    //         ).join(',');

    //         discounts.push({
    //             name: 'ムビチケカード',
    //             discount: (<factory.action.authorize.discount.mvtk.IResult>mvtkAuthorizeAction.result).price,
    //             discountCode: discountCode,
    //             discountCurrency: factory.priceCurrency.JPY
    //         });
    //     });

    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // クレジットカード決済があれば決済方法に追加
    params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.creditCard.ObjectType.CreditCard)
        .forEach((creditCardAuthorizeAction: factory.action.authorize.paymentMethod.creditCard.IAction) => {
            const actionResult = <factory.action.authorize.paymentMethod.creditCard.IResult>creditCardAuthorizeAction.result;
            paymentMethods.push({
                name: 'クレジットカード',
                paymentMethod: factory.paymentMethodType.CreditCard,
                paymentMethodId: actionResult.execTranResult.orderId
            });
        });

    // 口座決済があれば決済方法に追加
    params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment)
        .forEach((a: factory.action.authorize.paymentMethod.account.IAction<factory.accountType>) => {
            const actionResult = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result;
            paymentMethods.push({
                name: a.object.accountType,
                paymentMethod: factory.paymentMethodType.Account,
                paymentMethodId: actionResult.pendingTransaction.id
            });
        });

    // mocoin決済があれば決済方法に追加
    params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.mocoin.ObjectType.MocoinPayment)
        .forEach((a: factory.action.authorize.paymentMethod.mocoin.IAction) => {
            const actionResult = <factory.action.authorize.paymentMethod.mocoin.IResult>a.result;
            paymentMethods.push({
                name: 'Mocoin',
                paymentMethod: factory.paymentMethodType.Mocoin,
                paymentMethodId: actionResult.mocoinTransaction.token
            });
        });

    const url = util.format(
        '%s/inquiry/login?confirmationNumber=%s',
        process.env.ORDER_INQUIRY_ENDPOINT,
        params.confirmationNumber
    );

    return {
        typeOf: 'Order',
        seller: seller,
        customer: customer,
        price: acceptedOffers.reduce((a, b) => a + b.price, 0) - discounts.reduce((a, b) => a + b.discount, 0),
        priceCurrency: factory.priceCurrency.JPY,
        paymentMethods: paymentMethods,
        discounts: discounts,
        confirmationNumber: params.confirmationNumber,
        orderNumber: params.orderNumber,
        acceptedOffers: acceptedOffers,
        url: url,
        orderStatus: params.orderStatus,
        orderDate: params.orderDate,
        isGift: params.isGift
    };
}

export async function createEmailMessageFromTransaction(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    customerContact: factory.transaction.placeOrder.ICustomerContact;
    order: factory.order.IOrder;
    seller: factory.organization.movieTheater.IOrganization;
}): Promise<factory.creativeWork.message.email.ICreativeWork> {
    return new Promise<factory.creativeWork.message.email.ICreativeWork>((resolve, reject) => {
        const seller = params.transaction.seller;
        if (params.order.acceptedOffers[0].itemOffered.typeOf === factory.chevre.reservationType.EventReservation) {
            const event = params.order.acceptedOffers[0].itemOffered.reservationFor;

            pug.renderFile(
                `${__dirname}/../../../emails/sendOrder/text.pug`,
                {
                    familyName: params.customerContact.familyName,
                    givenName: params.customerContact.givenName,
                    confirmationNumber: params.order.confirmationNumber,
                    eventStartDate: util.format(
                        '%s - %s',
                        moment(event.startDate).locale('ja').tz('Asia/Tokyo').format('YYYY年MM月DD日(ddd) HH:mm'),
                        moment(event.endDate).tz('Asia/Tokyo').format('HH:mm')
                    ),
                    workPerformedName: event.workPerformed.name,
                    screenName: event.location.name.ja,
                    reservedSeats: params.order.acceptedOffers.map((o) => {
                        return util.format(
                            '%s %s ￥%s',
                            (<factory.chevre.reservation.event.IReservation<any>>o.itemOffered)
                                .reservedTicket.ticketedSeat.seatNumber,
                            (<factory.chevre.reservation.event.IReservation<any>>o.itemOffered)
                                .reservedTicket.ticketType.name.ja,
                            (<factory.chevre.reservation.event.IReservation<any>>o.itemOffered)
                                .reservedTicket.ticketType.charge
                        );
                    }).join('\n'),
                    price: params.order.price,
                    inquiryUrl: params.order.url,
                    sellerName: params.order.seller.name,
                    sellerTelephone: params.seller.telephone
                },
                (renderMessageErr, message) => {
                    if (renderMessageErr instanceof Error) {
                        reject(renderMessageErr);

                        return;
                    }

                    debug('message:', message);
                    pug.renderFile(
                        `${__dirname}/../../../emails/sendOrder/subject.pug`,
                        {
                            sellerName: params.order.seller.name
                        },
                        (renderSubjectErr, subject) => {
                            if (renderSubjectErr instanceof Error) {
                                reject(renderSubjectErr);

                                return;
                            }

                            debug('subject:', subject);

                            const email: factory.creativeWork.message.email.ICreativeWork = {
                                typeOf: factory.creativeWorkType.EmailMessage,
                                identifier: `placeOrderTransaction-${params.transaction.id}`,
                                name: `placeOrderTransaction-${params.transaction.id}`,
                                sender: {
                                    typeOf: seller.typeOf,
                                    name: seller.name.ja,
                                    email: 'noreply@ticket-cinemasunshine.com'
                                },
                                toRecipient: {
                                    typeOf: params.transaction.agent.typeOf,
                                    name: `${params.customerContact.familyName} ${params.customerContact.givenName}`,
                                    email: params.customerContact.email
                                },
                                about: subject,
                                text: message
                            };
                            resolve(email);
                        }
                    );
                }
            );
        }
    });
}

/**
 * 取引のポストアクションを作成する
 */
// tslint:disable-next-line:max-func-body-length
export async function createPotentialActionsFromTransaction(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    customerContact: factory.transaction.placeOrder.ICustomerContact;
    order: factory.order.IOrder;
    seller: factory.organization.movieTheater.IOrganization;
    sendEmailMessage?: boolean;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    // クレジットカード支払いアクション
    let payCreditCardAction: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard> | null = null;
    const creditCardPayment = params.order.paymentMethods.find((m) => m.paymentMethod === factory.paymentMethodType.CreditCard);
    if (creditCardPayment !== undefined) {
        payCreditCardAction = {
            typeOf: factory.actionType.PayAction,
            object: {
                paymentMethod: <factory.order.IPaymentMethod<factory.paymentMethodType.CreditCard>>creditCardPayment,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency
            },
            agent: params.transaction.agent,
            purpose: params.order
        };
    }

    // 口座支払いアクション
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.account.ObjectType.AccountPayment);
    const payAccountActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[] =
        authorizeAccountActions.map((a) => {
            return {
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: {
                    paymentMethod: {
                        name: factory.paymentMethodType.Account,
                        paymentMethod: <factory.paymentMethodType.Account>factory.paymentMethodType.Account,
                        paymentMethodId: a.id
                    },
                    pendingTransaction:
                        (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
                },
                agent: params.transaction.agent,
                purpose: params.order
            };
        });

    // mocoin支払いアクション
    const mocoinAuthorizeActions = <factory.action.authorize.paymentMethod.mocoin.IAction[]>params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.paymentMethod.mocoin.ObjectType.MocoinPayment);
    const payMocoinActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.Mocoin>[] =
        mocoinAuthorizeActions.map((a) => {
            return {
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: {
                    paymentMethod: {
                        name: 'Mocoin',
                        paymentMethod: <factory.paymentMethodType.Mocoin>factory.paymentMethodType.Mocoin,
                        paymentMethodId: a.id
                    },
                    mocoinTransaction: (<factory.action.authorize.paymentMethod.mocoin.IResult>a.result).mocoinTransaction,
                    mocoinEndpoint: (<factory.action.authorize.paymentMethod.mocoin.IResult>a.result).mocoinEndpoint
                },
                agent: params.transaction.agent,
                purpose: params.order
            };
        });

    // ムビチケ使用アクション
    // let useMvtkAction: factory.action.consume.use.mvtk.IAttributes | null = null;
    // const mvtkAuthorizeAction = <factory.action.authorize.discount.mvtk.IAction>params.transaction.object.authorizeActions
    //     .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
    //     .find((a) => a.object.typeOf === factory.action.authorize.discount.mvtk.ObjectType.Mvtk);
    // if (mvtkAuthorizeAction !== undefined) {
    //     useMvtkAction = {
    //         typeOf: factory.actionType.UseAction,
    //         object: {
    //             typeOf: factory.action.consume.use.mvtk.ObjectType.Mvtk,
    //             seatInfoSyncIn: mvtkAuthorizeAction.object.seatInfoSyncIn
    //         },
    //         agent: params.transaction.agent,
    //         purpose: params.order
    //     };
    // }

    // Pecorinoインセンティブに対する承認アクションの分だけ、Pecorinoインセンティブ付与アクションを作成する
    let givePointAwardActions: factory.action.transfer.give.pointAward.IAttributes[] = [];
    const pointAwardAuthorizeActions =
        (<factory.action.authorize.award.point.IAction[]>params.transaction.object.authorizeActions)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);
    givePointAwardActions = pointAwardAuthorizeActions.map((a) => {
        const actionResult = <factory.action.authorize.award.point.IResult>a.result;

        return {
            typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            object: {
                typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                pointTransaction: actionResult.pointTransaction,
                pointAPIEndpoint: actionResult.pointAPIEndpoint
            },
            purpose: params.order
        };
    });

    // メール送信ONであれば送信アクション属性を生成
    // tslint:disable-next-line:no-suspicious-comment
    // TODO メール送信アクションをセットする
    // 現時点では、フロントエンドからメール送信タスクを作成しているので不要
    let sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes | null = null;
    if (params.sendEmailMessage === true) {
        const emailMessage = await createEmailMessageFromTransaction({
            transaction: params.transaction,
            customerContact: params.customerContact,
            order: params.order,
            seller: params.seller
        });
        sendEmailMessageActionAttributes = {
            typeOf: factory.actionType.SendAction,
            object: emailMessage,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            potentialActions: {},
            purpose: params.order
        };
    }

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            sendEmailMessage: (sendEmailMessageActionAttributes !== null) ? sendEmailMessageActionAttributes : undefined
        }
    };

    return {
        order: {
            typeOf: factory.actionType.OrderAction,
            object: params.order,
            agent: params.transaction.agent,
            potentialActions: {
                // クレジットカード決済があれば支払アクション追加
                payCreditCard: (payCreditCardAction !== null) ? payCreditCardAction : undefined,
                // Pecorino決済があれば支払アクション追加
                payAccount: payAccountActions,
                payMocoin: payMocoinActions,
                // useMvtk: (useMvtkAction !== null) ? useMvtkAction : undefined,
                sendOrder: sendOrderActionAttributes,
                givePointAward: givePointAwardActions
            }
        }
    };
}
