/**
 * 進行中注文取引サービス
 */
import * as waiter from '@waiter/domain';
import * as createDebug from 'debug';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as util from 'util';

import * as emailMessageBuilder from '../../emailMessageBuilder';
import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as AuthorizePointAwardActionService from './placeOrderInProgress/action/authorize/award/point';
import * as AuthorizeSeatReservationActionService from './placeOrderInProgress/action/authorize/offer/seatReservation';
import * as AuthorizeAccountPaymentActionService from './placeOrderInProgress/action/authorize/paymentMethod/account';
import * as AuthorizeAnyPaymentActionService from './placeOrderInProgress/action/authorize/paymentMethod/any';
import * as AuthorizeCreditCardActionService from './placeOrderInProgress/action/authorize/paymentMethod/creditCard';
import * as AuthorizeMovieTicketActionService from './placeOrderInProgress/action/authorize/paymentMethod/movieTicket';

const debug = createDebug('cinerino-domain:service');
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type IStartOperation<T> = (repos: {
    organization: OrganizationRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;

/**
 * 取引開始
 */
export function start(
    params: factory.transaction.placeOrder.IStartParamsWithoutDetail
): IStartOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        organization: OrganizationRepo;
        transaction: TransactionRepo;
    }) => {
        // 売り手を取得
        const seller = await repos.organization.findById({ typeOf: params.seller.typeOf, id: params.seller.id });

        let passport: waiter.factory.passport.IPassport | undefined;
        // WAITER許可証トークンがあれば検証する
        if (params.object.passport !== undefined) {
            try {
                passport = await waiter.service.passport.verify(params.object.passport.token, params.object.passport.secret);
            } catch (error) {
                throw new factory.errors.Argument('Passport Token', `Invalid token: ${error.message}`);
            }

            // スコープを判別
            if (!validatePassport({
                passport: passport,
                issuer: params.object.passport.issuer,
                sellerId: seller.id
            })) {
                throw new factory.errors.Argument('Passport Token', 'Invalid passport');
            }
        }

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const transactionAttributes: factory.transaction.placeOrder.IAttributes = {
            typeOf: factory.transactionType.PlaceOrder,
            status: factory.transactionStatusType.InProgress,
            agent: params.agent,
            seller: {
                id: seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            object: {
                passportToken: (params.object.passport !== undefined) ? params.object.passport.token : undefined,
                passport: passport,
                clientUser: params.object.clientUser,
                authorizeActions: []
            },
            expires: params.expires,
            startDate: new Date(),
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        };

        let transaction: factory.transaction.placeOrder.ITransaction;
        try {
            transaction = await repos.transaction.start<factory.transactionType.PlaceOrder>(transactionAttributes);
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
                    throw new factory.errors.AlreadyInUse('Transaction', ['passportToken'], 'Passport already used');
                }
            }

            throw error;
        }

        return transaction;
    };
}

/**
 * WAITER許可証の有効性チェック
 */
function validatePassport(params: {
    passport: waiter.factory.passport.IPassport;
    issuer: string;
    sellerId: string;
}) {
    // スコープのフォーマットは、Transaction:PlaceOrder:${sellerId}
    const explodedScopeStrings = params.passport.scope.split(':');

    return (
        params.passport.iss === params.issuer && // 許可証発行者確認
        // tslint:disable-next-line:no-magic-numbers
        explodedScopeStrings.length === 3 &&
        explodedScopeStrings[0] === 'Transaction' && // スコープ接頭辞確認
        explodedScopeStrings[1] === factory.transactionType.PlaceOrder && // スコープ接頭辞確認
        // tslint:disable-next-line:no-magic-numbers
        explodedScopeStrings[2] === params.sellerId // 販売者識別子確認
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
            export import seatReservation = AuthorizeSeatReservationActionService;
        }
        export namespace paymentMethod {
            /**
             * 口座承認アクションサービス
             */
            export import account = AuthorizeAccountPaymentActionService;
            /**
             * 汎用決済承認アクションサービス
             */
            export import any = AuthorizeAnyPaymentActionService;
            /**
             * クレジットカード承認アクションサービス
             */
            export import creditCard = AuthorizeCreditCardActionService;
            /**
             * ムビチケ承認アクションサービス
             */
            export import movieTicket = AuthorizeMovieTicketActionService;
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
            const phoneNumber = phoneUtil.parse(params.contact.telephone);
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('contact.telephone', error.message);
        }

        // 連絡先を生成
        const customerContact: factory.transaction.placeOrder.ICustomerContact = {
            familyName: params.contact.familyName,
            givenName: params.contact.givenName,
            email: params.contact.email,
            telephone: formattedTelephone
        };
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });
        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }
        await repos.transaction.setCustomerContactOnPlaceOrderInProgress({
            id: params.transactionId,
            contact: customerContact
        });

        return customerContact;
    };
}

/**
 * 注文取引を確定する
 */
export function confirm(params: {
    /**
     * 取引ID
     */
    id: string;
    /**
     * 取引進行者
     */
    agent: { id: string };
    result: {
        order: {
            /**
             * 注文日時
             */
            orderDate: Date;
        };
    };
    options: {
        /**
         * 注文メールを送信するかどうか
         */
        sendEmailMessage?: boolean;
    };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        organization: OrganizationRepo;
        orderNumber: OrderNumberRepo;
        confirmationNumber: ConfirmationNumberRepo;
    }) => {
        let transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });
        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return <factory.transaction.placeOrder.IResult>transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transactionId', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
        }

        if (transaction.agent.id !== params.agent.id) {
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
        let authorizeActions = await repos.action.findAuthorizeByTransactionId({ transactionId: params.id });
        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.result.order.orderDate));
        transaction.object.authorizeActions = authorizeActions;

        // 取引の確定条件が全て整っているかどうか確認
        validateTransaction(transaction);

        // ムビチケ条件が整っているかどうか確認
        validateMovieTicket(transaction);

        // 注文番号を発行
        const orderNumber = await repos.orderNumber.publish({
            orderDate: params.result.order.orderDate,
            sellerType: seller.typeOf,
            sellerBranchCode: seller.location.branchCode
        });
        const confirmationNumber = await repos.confirmationNumber.publish({
            orderDate: params.result.order.orderDate
        });
        // 結果作成
        const order = createOrderFromTransaction({
            transaction: transaction,
            orderNumber: orderNumber,
            confirmationNumber: confirmationNumber,
            orderDate: params.result.order.orderDate,
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
            sendEmailMessage: params.options.sendEmailMessage
        });

        // ステータス変更
        debug('updating transaction...');
        transaction = await repos.transaction.confirmPlaceOrder({
            id: params.id,
            authorizeActions: authorizeActions,
            result: result,
            potentialActions: potentialActions
        });

        return <factory.transaction.placeOrder.IResult>transaction.result;
    };
}

/**
 * 取引が確定可能な状態かどうかをチェックする
 */
// tslint:disable-next-line:max-func-body-length
export function validateTransaction(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;
    let priceByAgent = 0;
    let priceBySeller = 0;

    // 決済承認を確認
    Object.keys(factory.paymentMethodType).forEach((key) => {
        const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
        priceByAgent += authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === paymentMethodType)
            .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
    });

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
        // 必要ポイントがある場合、ポイント承認金額と比較
        if (requiredPoint > 0) {
            const authorizedPointAmount =
                (<factory.action.authorize.paymentMethod.account.IAction<factory.accountType.Point>[]>authorizeActions)
                    .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                    .filter((a) => a.object.typeOf === factory.paymentMethodType.Account)
                    .filter((a) => {
                        const result = (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType.Point>>a.result);

                        return result.fromAccount.accountType === factory.accountType.Point;
                    })
                    .reduce((a, b) => a + b.object.amount, 0);
            if (requiredPoint !== authorizedPointAmount) {
                throw new factory.errors.Argument('transactionId', 'Required point amount not satisfied');
            }
        }
    }

    // JPY承認金額も承認ポイントも0より大きくなければ取引成立不可
    if (priceByAgent < 0 && requiredPoint < 0) {
        throw new factory.errors.Argument('transactionId', 'Price or point must be over 0');
    }
    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('transactionId', 'Transaction cannot be confirmed because prices are not matched');
    }
}

/**
 * 座席予約オファー承認に対してムビチケ承認条件が整っているかどうか検証する
 */
export function validateMovieTicket(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;

    const authorizeMovieTicketActions = <factory.action.authorize.paymentMethod.movieTicket.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.paymentMethodType.MovieTicket);

    const seatReservationAuthorizeActions = <factory.action.authorize.offer.seatReservation.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // ムビチケオファーを受け付けた座席予約を検索する
    const requiredMovieTickets: factory.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
    seatReservationAuthorizeActions.forEach((a) => {
        a.object.acceptedOffer.forEach((offer: factory.chevre.event.screeningEvent.IAcceptedTicketOffer) => {
            offer.priceSpecification.priceComponent.forEach((component) => {
                // ムビチケ券種区分チャージ仕様があれば検証リストに追加
                if (component.typeOf === factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification) {
                    requiredMovieTickets.push({
                        typeOf: factory.paymentMethodType.MovieTicket,
                        identifier: '',
                        accessCode: '',
                        serviceType: component.appliesToMovieTicketType,
                        serviceOutput: {
                            reservationFor: { typeOf: factory.chevre.eventType.ScreeningEvent, id: a.object.event.id },
                            reservedTicket: { ticketedSeat: offer.ticketedSeat }
                        }
                    });
                }
            });
        });
    });
    debug(requiredMovieTickets.length, 'movie tickets required');

    const authorizedMovieTickets: factory.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
    authorizeMovieTicketActions.forEach((a) => {
        authorizedMovieTickets.push(...a.object.movieTickets);
    });
    debug(authorizedMovieTickets.length, 'movie tickets authorized');

    // 合計枚数OK?
    if (requiredMovieTickets.length !== authorizedMovieTickets.length) {
        throw new factory.errors.Argument('transactionId', 'Required number of movie tickets not satisfied');
    }

    // イベントとムビチケ券種区分ごとに枚数OK?
    const eventIds = [...new Set(requiredMovieTickets.map((t) => t.serviceOutput.reservationFor.id))];
    debug('movie ticket event ids:', eventIds);
    eventIds.forEach((eventId) => {
        const requiredMovieTicketsByEvent = requiredMovieTickets.filter((t) => t.serviceOutput.reservationFor.id === eventId);

        // 券種ごとに枚数が適切か確認
        const serviceTypes = [...new Set(requiredMovieTicketsByEvent.map((t) => t.serviceType))];
        debug('movie ticket serviceTypes:', serviceTypes);
        serviceTypes.forEach((serviceType) => {
            const requiredMovieTicketsByServiceType = requiredMovieTicketsByEvent.filter((t) => t.serviceType === serviceType);
            debug(requiredMovieTicketsByServiceType.length, 'movie tickets required', eventId, serviceType);
            const authorizedMovieTicketsByEventAndServiceType = authorizedMovieTickets.filter((t) => {
                return t.serviceOutput.reservationFor.id === eventId && t.serviceType === serviceType;
            });
            if (requiredMovieTicketsByServiceType.length !== authorizedMovieTicketsByEventAndServiceType.length) {
                throw new factory.errors.Argument('transactionId', 'Required number of movie tickets not satisfied');
            }
        });

        // 座席番号リストが一致しているか確認
        const seatNumbers = requiredMovieTicketsByEvent.map((t) => t.serviceOutput.reservedTicket.ticketedSeat.seatNumber);
        seatNumbers.forEach((seatNumber) => {
            const authorizedMovieTicketsByEventAndSeatNumber = authorizedMovieTickets.find((t) => {
                return t.serviceOutput.reservationFor.id === eventId
                    && t.serviceOutput.reservedTicket.ticketedSeat.seatNumber === seatNumber;
            });
            if (authorizedMovieTicketsByEventAndSeatNumber === undefined) {
                throw new factory.errors.Argument('transactionId', `Movie Ticket for ${seatNumber} required`);
            }
        });
    });
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

    // 購入者を識別する情報をまとめる
    const customerIdentifier = (Array.isArray(params.transaction.agent.identifier)) ? params.transaction.agent.identifier : [];
    const customer: factory.order.ICustomer = {
        id: params.transaction.agent.id,
        typeOf: params.transaction.agent.typeOf,
        name: `${cutomerContact.familyName} ${cutomerContact.givenName}`,
        url: '',
        identifier: customerIdentifier,
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
                priceSpecification: tmpReserve.price,
                // price: tmpReserve.price,
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
    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // 決済方法をセット
    Object.keys(factory.paymentMethodType).forEach((key) => {
        const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === paymentMethodType)
            .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);
                paymentMethods.push({
                    name: result.name,
                    typeOf: paymentMethodType,
                    paymentMethodId: result.paymentMethodId,
                    additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : []
                });
            });
    });

    const url = util.format(
        '%s/inquiry/login?confirmationNumber=%s',
        process.env.ORDER_INQUIRY_ENDPOINT,
        params.confirmationNumber
    );

    // 決済方法から注文金額の計算
    let price = 0;
    Object.keys(factory.paymentMethodType).forEach((key) => {
        const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
        price += params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === paymentMethodType)
            .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
    });

    return {
        typeOf: 'Order',
        seller: seller,
        customer: customer,
        price: price,
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
    const authorizeCreditCardActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.CreditCard);
    const payCreditCardActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.CreditCard>[] = [];
    authorizeCreditCardActions.forEach((a) => {
        const result = <factory.action.authorize.paymentMethod.creditCard.IResult>a.result;
        if (result.paymentStatus === factory.paymentStatusType.PaymentDue) {
            payCreditCardActions.push({
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        name: result.name,
                        typeOf: <factory.paymentMethodType.CreditCard>result.paymentMethod,
                        paymentMethodId: result.paymentMethodId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : []
                    },
                    price: result.amount,
                    priceCurrency: factory.priceCurrency.JPY,
                    entryTranArgs: result.entryTranArgs,
                    execTranArgs: result.execTranArgs
                }],
                agent: params.transaction.agent,
                purpose: params.order
            });
        }
    });

    // 口座支払いアクション
    const authorizeAccountActions = <factory.action.authorize.paymentMethod.account.IAction<factory.accountType>[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.Account);
    const payAccountActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.Account>[] =
        authorizeAccountActions.map((a) => {
            const result = <factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result;

            return {
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        name: result.name,
                        typeOf: <factory.paymentMethodType.Account>result.paymentMethod,
                        paymentMethodId: result.paymentMethodId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : []
                    },
                    pendingTransaction:
                        (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
                }],
                agent: params.transaction.agent,
                purpose: params.order
            };
        });

    // ムビチケ決済アクション
    // ムビチケ着券は、注文単位でまとめて実行しないと失敗するので注意
    const authorizeMovieTicketActions = <factory.action.authorize.paymentMethod.movieTicket.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.MovieTicket);
    const payMovieTicketActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
    if (authorizeMovieTicketActions.length > 0) {
        payMovieTicketActions.push({
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: authorizeMovieTicketActions.map((a) => {
                const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

                return {
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        name: result.name,
                        typeOf: <factory.paymentMethodType.MovieTicket>result.paymentMethod,
                        paymentMethodId: result.paymentMethodId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : []
                    },
                    movieTickets: a.object.movieTickets
                };
            }),
            agent: params.transaction.agent,
            purpose: params.order
        });
    }

    // ポイントインセンティブに対する承認アクションの分だけ、ポイントインセンティブ付与アクションを作成する
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
    let sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes | null = null;
    if (params.sendEmailMessage === true) {
        const emailMessage = await emailMessageBuilder.createSendOrderMessage({
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
                payCreditCard: payCreditCardActions,
                payAccount: payAccountActions,
                payMovieTicket: payMovieTicketActions,
                sendOrder: sendOrderActionAttributes,
                givePointAward: givePointAwardActions
            }
        }
    };
}
