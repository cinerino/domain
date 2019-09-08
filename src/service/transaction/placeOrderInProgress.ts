/**
 * 進行中注文取引サービス
 */
import * as COA from '@motionpicture/coa-service';
import * as waiter from '@waiter/domain';
import * as createDebug from 'debug';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import * as moment from 'moment';
import { format } from 'util';

import * as emailMessageBuilder from '../../emailMessageBuilder';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as AuthorizePointAwardActionService from './placeOrderInProgress/action/authorize/award/point';
import * as AuthorizeMvtkDiscountActionService from './placeOrderInProgress/action/authorize/discount/mvtk';
import * as ProgramMembershipAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/programMembership';
import * as AuthorizeSeatReservationActionService from './placeOrderInProgress/action/authorize/offer/seatReservation';
import * as AuthorizeSeatReservation4coaActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4coa';

const debug = createDebug('cinerino-domain:service');
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type IStartOperation<T> = (repos: {
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;
export type ISeller = factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType>>;

export type IPassportValidator = (params: { passport: factory.waiter.passport.IPassport }) => boolean;
export type IStartParams = factory.transaction.placeOrder.IStartParamsWithoutDetail & {
    passportValidator?: IPassportValidator;
};

export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type IAuthorizeSeatReservationOfferResult =
    factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier>;

export type IAuthorizePointAccountPayment = factory.action.authorize.paymentMethod.account.IAccount<factory.accountType.Point>;

export type IAuthorizeActionResultBySeller =
    // factory.action.authorize.offer.programMembership.IResult |
    IAuthorizeSeatReservationOfferResult |
    factory.action.authorize.award.point.IResult;

export type IReservationPriceSpecification =
    factory.chevre.reservation.IPriceSpecification<factory.chevre.reservationType.EventReservation>;

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

/**
 * 取引開始
 */
export function start(params: IStartParams): IStartOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        // 売り手を取得
        const seller = await repos.seller.findById({ id: params.seller.id });

        let passport: factory.waiter.passport.IPassport | undefined;
        // WAITER許可証トークンがあれば検証する
        if (params.object.passport !== undefined) {
            try {
                passport = await waiter.service.passport.verify({
                    token: params.object.passport.token,
                    secret: params.object.passport.secret
                });
            } catch (error) {
                throw new factory.errors.Argument('Passport Token', `Invalid token: ${error.message}`);
            }

            // 許可証バリデーション
            if (typeof params.passportValidator === 'function') {
                if (!params.passportValidator({ passport: passport })) {
                    throw new factory.errors.Argument('Passport Token', 'Invalid passport');
                }
            }
        }

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const transactionAttributes: factory.transaction.placeOrder.IAttributes = {
            project: (params.project !== undefined) ? { typeOf: 'Project', id: params.project.id } : undefined,
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
            /**
             * ムビチケ承認アクションサービス
             * @deprecated
             */
            export import mvtk = AuthorizeMvtkDiscountActionService;
        }
        export namespace offer {
            /**
             * 会員プログラム承認アクションサービス
             */
            export import programMembership = ProgramMembershipAuthorizeActionService;
            /**
             * 座席予約承認アクションサービス
             */
            export import seatReservation = AuthorizeSeatReservationActionService;
            /**
             * 座席予約承認アクションサービス(連携先がCOA限定)
             */
            export import seatReservation4coa = AuthorizeSeatReservation4coaActionService;
        }
    }
}

/**
 * 顧客プロフィール更新
 */
export function updateCustomerProfile(params: {
    id: string;
    agent: factory.transaction.placeOrder.ICustomerProfile & { id: string };
}): ITransactionOperation<factory.transaction.placeOrder.ICustomerProfile> {
    return async (repos: { transaction: TransactionRepo }) => {
        let formattedTelephone: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.agent.telephone);
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('contact.telephone', error.message);
        }

        // プロフィール作成
        const profile: factory.transaction.placeOrder.ICustomerProfile = {
            familyName: params.agent.familyName,
            givenName: params.agent.givenName,
            email: params.agent.email,
            telephone: formattedTelephone
        };

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours');
        }

        await repos.transaction.updateCustomerProfile({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id,
            agent: profile
        });

        return profile;
    };
}

export type IOrderConfirmationNumberGenerator = (order: factory.order.IOrder) => string;
export type IOrderURLGenerator = (order: factory.order.IOrder) => string;
export interface IConfirmResultOrderParams {
    /**
     * 注文日時
     */
    orderDate: Date;
    /**
     * 確認番号のカスタム指定
     */
    confirmationNumber?: string | IOrderConfirmationNumberGenerator;
    /**
     * 注文確認URLのカスタム指定
     */
    url?: string | IOrderURLGenerator;
    /**
     * 注文アイテム数
     */
    numItems?: {
        maxValue?: number;
        minValue?: number;
    };
}

export interface IConfirmParams extends factory.transaction.placeOrder.IConfirmParams {
    project: factory.chevre.project.IProject;
    result: {
        order: IConfirmResultOrderParams;
    };
    /**
     * 注文配送メールを送信するかどうか
     */
    sendEmailMessage?: boolean;
    email?: factory.creativeWork.message.email.ICustomization;
    /**
     * ムビチケバリデーションを適用するかどうか
     */
    validateMovieTicket?: boolean;
}

/**
 * 注文取引を確定する
 */
export function confirm(params: IConfirmParams) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        seller: SellerRepo;
        orderNumber: OrderNumberRepo;
        confirmationNumber?: ConfirmationNumberRepo;
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

        if (params.agent !== undefined && typeof params.agent.id === 'string') {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('A specified transaction is not yours');
            }
        }

        const project: factory.project.IProject = (transaction.project !== undefined)
            ? transaction.project
            : { typeOf: 'Project', id: <string>process.env.PROJECT_ID };

        const seller = await repos.seller.findById({ id: transaction.seller.id });
        debug('seller found.', seller.id);

        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: factory.transactionType.PlaceOrder,
                id: params.id
            }
        });
        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.result.order.orderDate));
        transaction.object.authorizeActions = authorizeActions;

        // 取引の確定条件が全て整っているかどうか確認
        validateTransaction(transaction);

        // ムビチケ条件が整っているかどうか確認
        if (params.validateMovieTicket === true) {
            validateMovieTicket(transaction);
        }

        // 注文作成
        const order = createOrderFromTransaction({
            project: params.project,
            transaction: transaction,
            orderDate: params.result.order.orderDate,
            orderStatus: factory.orderStatus.OrderProcessing,
            isGift: false,
            seller: seller
        });

        validateEventOffers({
            transaction: transaction,
            order: order
        });

        // 注文アイテム数制限確認
        if (params.result.order.numItems !== undefined) {
            if (typeof params.result.order.numItems.maxValue === 'number') {
                if (order.acceptedOffers.length > params.result.order.numItems.maxValue) {
                    throw new factory.errors.Argument(
                        'Transaction',
                        format('Number of order items must be less than or equal to %s', params.result.order.numItems.maxValue)
                    );
                }
            }

            if (typeof params.result.order.numItems.minValue === 'number') {
                if (order.acceptedOffers.length < params.result.order.numItems.minValue) {
                    throw new factory.errors.Argument(
                        'Transaction',
                        format('Number of order items must be more than equal to %s', params.result.order.numItems.minValue)
                    );
                }
            }
        }

        // 注文番号を発行
        // order.orderNumber = await repos.orderNumber.publish({
        //     orderDate: params.result.order.orderDate,
        //     sellerType: seller.typeOf,
        //     sellerBranchCode: (seller.location !== undefined && seller.location.branchCode !== undefined)
        //         ? seller.location.branchCode
        //         : ''
        // });
        order.orderNumber = await repos.orderNumber.publishByTimestamp({
            project: project,
            orderDate: params.result.order.orderDate
        });

        // 確認番号を発行
        let confirmationNumber = 0;
        if (repos.confirmationNumber !== undefined) {
            confirmationNumber = await repos.confirmationNumber.publish({
                orderDate: params.result.order.orderDate
            });
        }
        order.confirmationNumber = confirmationNumber.toString();

        // 確認番号の指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof params.result.order.confirmationNumber === 'string') {
            order.confirmationNumber = params.result.order.confirmationNumber;
        } else /* istanbul ignore next */ if (typeof params.result.order.confirmationNumber === 'function') {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            order.confirmationNumber = params.result.order.confirmationNumber(order);
        }

        // URLの指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof params.result.order.url === 'string') {
            order.url = params.result.order.url;
        } else /* istanbul ignore next */ if (typeof params.result.order.url === 'function') {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            order.url = params.result.order.url(order);
        }

        const result: factory.transaction.placeOrder.IResult = { order };

        // ポストアクションを作成
        const potentialActions = await createPotentialActionsFromTransaction({
            transaction: transaction,
            order: order,
            seller: seller,
            sendEmailMessage: params.sendEmailMessage,
            email: params.email,
            potentialActions: params.potentialActions
        });

        // ステータス変更
        debug('finally confirming transaction...');
        transaction = await repos.transaction.confirm({
            typeOf: transaction.typeOf,
            id: transaction.id,
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
export function validateTransaction(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;
    const profile = transaction.agent;
    let priceByAgent = 0;
    let priceBySeller = 0;

    if (profile.email === undefined
        || profile.familyName === undefined
        || profile.givenName === undefined
        || profile.telephone === undefined) {
        throw new factory.errors.Argument('Transaction', 'Customer Profile Required');
    }

    // 決済承認を確認
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            priceByAgent += authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === paymentMethodType)
                .filter((a) => {
                    const totalPaymentDue = (<IAuthorizeAnyPaymentResult>a.result).totalPaymentDue;

                    return totalPaymentDue !== undefined && totalPaymentDue.currency === factory.priceCurrency.JPY;
                })
                .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
        });

    // 販売者が提供するアイテムの発生金額
    priceBySeller += authorizeActions
        .filter((authorizeAction) => authorizeAction.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((authorizeAction) => authorizeAction.agent.id === transaction.seller.id)
        .reduce((a, b) => a + (<IAuthorizeActionResultBySeller>b.result).price, 0);
    debug('priceByAgent priceBySeller:', priceByAgent, priceBySeller);

    // ポイント鑑賞券によって必要なポイントがどのくらいあるか算出
    const requiredPoint = (<IAuthorizeSeatReservationOffer[]>
        authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
        .reduce(
            (a, b) => {
                const point = (<IAuthorizeSeatReservationOfferResult>b.result).point;

                return a + ((typeof point === 'number') ? point : 0);
            },
            0
        );

    // 必要ポイントがある場合、ポイントのオーソリ金額と比較
    const authorizedPointAmount =
        (<factory.action.authorize.paymentMethod.account.IAction<factory.accountType.Point>[]>transaction.object.authorizeActions)
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.paymentMethodType.Account)
            .filter((a) => (<IAuthorizePointAccountPayment>a.object.fromAccount).accountType === factory.accountType.Point)
            .reduce((a, b) => a + b.object.amount, 0);

    // ポイントインセンティブは複数可だが、現時点で1注文につき1ポイントに限定
    const pointAwardAuthorizeActions = <factory.action.authorize.award.point.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.award.point.ObjectType.PointAward);
    const givenAmount = pointAwardAuthorizeActions.reduce((a, b) => a + b.object.amount, 0);
    if (givenAmount > 1) {
        throw new factory.errors.Argument('Transaction', 'Incentive amount must be 1');
    }

    if (requiredPoint !== authorizedPointAmount) {
        throw new factory.errors.Argument('Transaction', 'Required point amount not satisfied');
    }

    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('Transaction', 'Transaction cannot be confirmed because prices are not matched');
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

    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // ムビチケオファーを受け付けた座席予約を検索する
    const requiredMovieTickets: factory.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
    seatReservationAuthorizeActions.forEach((a) => {
        const acceptedOffer =
            (<factory.action.authorize.offer.seatReservation.IObject<factory.service.webAPI.Identifier.Chevre>>a.object).acceptedOffer;
        acceptedOffer.forEach((offer: factory.chevre.event.screeningEvent.IAcceptedTicketOffer) => {
            const offeredTicketedSeat = offer.ticketedSeat;
            if (offeredTicketedSeat !== undefined) {
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
                                reservedTicket: { ticketedSeat: offeredTicketedSeat }
                            }
                        });
                    }
                });
            }
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
 * 注文オブジェクトを生成する
 */
// tslint:disable-next-line:max-func-body-length
export function createOrderFromTransaction(params: {
    project: factory.chevre.project.IProject;
    transaction: factory.transaction.placeOrder.ITransaction;
    orderDate: Date;
    orderStatus: factory.orderStatus;
    isGift: boolean;
    seller: ISeller;
}): factory.order.IOrder {
    // 座席予約に対する承認アクション取り出す
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // 会員プログラムに対する承認アクションを取り出す
    const programMembershipAuthorizeActions = params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === 'Offer')
        .filter((a) => a.object.itemOffered.typeOf === 'ProgramMembership');
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipAuthorizeActions.length > 1) {
        throw new factory.errors.NotImplemented('Number of programMembership authorizeAction must be 1');
    }
    const programMembershipAuthorizeAction = programMembershipAuthorizeActions.shift();

    const profile = params.transaction.agent;

    const seller: factory.order.ISeller = {
        id: params.transaction.seller.id,
        identifier: params.transaction.seller.identifier,
        name: params.transaction.seller.name.ja,
        legalName: params.transaction.seller.legalName,
        typeOf: params.transaction.seller.typeOf,
        telephone: params.transaction.seller.telephone,
        url: params.transaction.seller.url
    };

    // 購入者を識別する情報をまとめる
    const customerIdentifier = (Array.isArray(params.transaction.agent.identifier)) ? params.transaction.agent.identifier : [];
    const customer: factory.order.ICustomer = {
        ...profile,
        id: params.transaction.agent.id,
        typeOf: params.transaction.agent.typeOf,
        name: `${profile.familyName} ${profile.givenName}`,
        url: '',
        identifier: customerIdentifier
    };
    if (params.transaction.agent.memberOf !== undefined) {
        customer.memberOf = params.transaction.agent.memberOf;
    }

    const acceptedOffers: factory.order.IAcceptedOffer<factory.order.IItemOffered>[] = [];

    // 座席予約がある場合
    seatReservationAuthorizeActions.forEach((authorizeSeatReservationAction) => {
        if (authorizeSeatReservationAction !== undefined) {
            if (authorizeSeatReservationAction.result === undefined) {
                throw new factory.errors.Argument('Transaction', 'Seat reservation result does not exist');
            }

            let responseBody = authorizeSeatReservationAction.result.responseBody;

            if (authorizeSeatReservationAction.instrument === undefined) {
                authorizeSeatReservationAction.instrument = {
                    typeOf: 'WebAPI',
                    identifier: factory.service.webAPI.Identifier.Chevre
                };
            }

            let event: factory.chevre.event.screeningEvent.IEvent = authorizeSeatReservationAction.object.event;

            switch (authorizeSeatReservationAction.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    const updTmpReserveSeatResult = responseBody;

                    // 座席仮予約からオファー情報を生成する
                    // tslint:disable-next-line:max-func-body-length
                    acceptedOffers.push(...updTmpReserveSeatResult.listTmpReserve.map((tmpReserve, index) => {
                        const requestedOffer = authorizeSeatReservationAction.object.acceptedOffer.find((o) => {
                            let offer = o;

                            if ((<any>offer).ticketInfo !== undefined) {
                                offer = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4COA>o;

                                return (offer.seatNumber === tmpReserve.seatNum && offer.seatSection === tmpReserve.seatSection);
                            } else {
                                offer = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4chevre>o;

                                return (offer.ticketedSeat !== undefined
                                    && offer.ticketedSeat.seatNumber === tmpReserve.seatNum
                                    && offer.ticketedSeat.seatSection === tmpReserve.seatSection);

                            }
                        });
                        if (requestedOffer === undefined) {
                            throw new factory.errors.Argument('offers', '要求された供給情報と仮予約結果が一致しません');
                        }

                        let coaInfo: factory.event.screeningEvent.ICOAInfo | undefined;
                        if (event.coaInfo !== undefined) {
                            coaInfo = event.coaInfo;
                        } else {
                            if (Array.isArray(event.additionalProperty)) {
                                // const coaEndpointProperty = event.additionalProperty.find((p) => p.name === 'COA_ENDPOINT');
                                const coaInfoProperty = event.additionalProperty.find((p) => p.name === 'coaInfo');
                                coaInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
                            }
                        }

                        if (coaInfo === undefined) {
                            throw new factory.errors.NotFound('Event COA Info');
                        }

                        // チケットトークン(QRコード文字列)を作成
                        const ticketToken = [
                            coaInfo.theaterCode,
                            coaInfo.dateJouei,
                            // tslint:disable-next-line:no-magic-numbers
                            (`00000000${updTmpReserveSeatResult.tmpReserveNum}`).slice(-8),
                            // tslint:disable-next-line:no-magic-numbers
                            (`000${index + 1}`).slice(-3)
                        ].join('');

                        // tslint:disable-next-line:max-line-length
                        // const unitPriceSpec = <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
                        //     requestedOffer.priceSpecification.priceComponent.find(
                        //         (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                        //     );
                        // if (unitPriceSpec === undefined) {
                        //     throw new factory.errors.Argument('Accepted Offer', 'Unit price specification not found');
                        // }

                        const reservation: factory.order.IReservation = {
                            project: params.project,
                            typeOf: factory.chevre.reservationType.EventReservation,
                            id: `${updTmpReserveSeatResult.tmpReserveNum}-${index.toString()}`,
                            additionalTicketText: '',
                            numSeats: 1,
                            reservationFor: {
                                ...event,
                                additionalProperty: undefined,
                                offers: undefined,
                                remainingAttendeeCapacity: undefined,
                                maximumAttendeeCapacity: undefined,
                                attendeeCount: undefined,
                                checkInCount: undefined,
                                superEvent: {
                                    ...event.superEvent,
                                    additionalProperty: undefined,
                                    offers: undefined,
                                    workPerformed: {
                                        ...event.superEvent.workPerformed,
                                        offers: undefined
                                    }
                                },
                                workPerformed: (event.workPerformed !== undefined)
                                    ? {
                                        ...event.workPerformed,
                                        offers: undefined
                                    }
                                    : undefined
                            },
                            reservationNumber: `${updTmpReserveSeatResult.tmpReserveNum}`,
                            reservedTicket: {
                                typeOf: 'Ticket',
                                coaTicketInfo: (<any>requestedOffer).ticketInfo,
                                dateIssued: params.orderDate,
                                // issuedBy: {
                                //     typeOf: event.location.typeOf,
                                //     name: event.location.name.ja
                                // },
                                ticketedSeat: {
                                    typeOf: factory.chevre.placeType.Seat,
                                    seatingType: { typeOf: <any>'Default' },
                                    seatNumber: tmpReserve.seatNum,
                                    seatRow: '',
                                    seatSection: tmpReserve.seatSection
                                },
                                ticketNumber: ticketToken,
                                ticketToken: ticketToken,
                                ticketType: {
                                    project: params.project,
                                    typeOf: <'Offer'>'Offer',
                                    id: requestedOffer.id,
                                    identifier: <string>requestedOffer.identifier,
                                    name: <factory.multilingualString>requestedOffer.name,
                                    description: <factory.multilingualString>requestedOffer.description,
                                    additionalProperty: requestedOffer.additionalProperty,
                                    priceCurrency: factory.priceCurrency.JPY
                                }
                            }
                        };

                        return {
                            typeOf: <factory.chevre.offerType>'Offer',
                            itemOffered: reservation,
                            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.COA },
                            priceSpecification: requestedOffer.priceSpecification,
                            priceCurrency: factory.priceCurrency.JPY,
                            seller: {
                                typeOf: seller.typeOf,
                                name: seller.name
                            }
                        };
                    }));

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                    if (event.name === undefined) {
                        event = responseBody.object.reservations[0].reservationFor;
                    }

                    // 座席仮予約からオファー情報を生成する
                    acceptedOffers.push(...responseBody.object.reservations.map((tmpReserve) => {
                        const itemOffered: factory.order.IReservation = tmpReserve;
                        const priceSpecification = <IReservationPriceSpecification>tmpReserve.price;

                        const reservation: factory.order.IReservation = {
                            ...itemOffered,
                            checkedIn: undefined,
                            attended: undefined,
                            modifiedTime: undefined,
                            reservationStatus: undefined,
                            price: undefined,
                            priceCurrency: undefined,
                            underName: undefined,
                            reservationFor: {
                                ...itemOffered.reservationFor,
                                additionalProperty: undefined,
                                maximumAttendeeCapacity: undefined,
                                remainingAttendeeCapacity: undefined,
                                checkInCount: undefined,
                                attendeeCount: undefined,
                                offers: undefined,
                                superEvent: {
                                    ...event.superEvent,
                                    additionalProperty: undefined,
                                    maximumAttendeeCapacity: undefined,
                                    remainingAttendeeCapacity: undefined,
                                    offers: undefined,
                                    workPerformed: {
                                        ...event.superEvent.workPerformed,
                                        offers: undefined
                                    }
                                },
                                workPerformed: (event.workPerformed !== undefined)
                                    ? {
                                        ...event.workPerformed,
                                        offers: undefined
                                    }
                                    : undefined
                            },
                            reservedTicket: {
                                ...itemOffered.reservedTicket,
                                issuedBy: undefined,
                                priceCurrency: undefined,
                                totalPrice: undefined,
                                underName: undefined,
                                ticketType: {
                                    project: params.project,
                                    typeOf: itemOffered.reservedTicket.ticketType.typeOf,
                                    id: itemOffered.reservedTicket.ticketType.id,
                                    identifier: itemOffered.reservedTicket.ticketType.identifier,
                                    name: itemOffered.reservedTicket.ticketType.name,
                                    description: itemOffered.reservedTicket.ticketType.description,
                                    additionalProperty: itemOffered.reservedTicket.ticketType.additionalProperty,
                                    priceCurrency: itemOffered.reservedTicket.ticketType.priceCurrency
                                }
                            }
                        };

                        return {
                            typeOf: <factory.chevre.offerType>'Offer',
                            itemOffered: reservation,
                            offeredThrough: { typeOf: <'WebAPI'>'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre },
                            priceSpecification: {
                                ...priceSpecification,
                                priceComponent: priceSpecification.priceComponent.map((c) => {
                                    return {
                                        ...c,
                                        accounting: undefined // accountingはorderに不要な情報
                                    };
                                })
                            },
                            priceCurrency: (tmpReserve.priceCurrency !== undefined) ? tmpReserve.priceCurrency : factory.priceCurrency.JPY,
                            seller: {
                                typeOf: seller.typeOf,
                                name: seller.name
                            }
                        };
                    }));
            }
        }
    });

    // 会員プログラムがある場合
    if (programMembershipAuthorizeAction !== undefined) {
        acceptedOffers.push(programMembershipAuthorizeAction.object);
    }

    const discounts: factory.order.IDiscount[] = [];
    params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.discount.mvtk.ObjectType.Mvtk)
        .forEach((mvtkAuthorizeAction: factory.action.authorize.discount.mvtk.IAction) => {
            const discountCode = mvtkAuthorizeAction.object.seatInfoSyncIn.knyknrNoInfo
                .map((knshInfo) => knshInfo.knyknrNo)
                .join(',');

            discounts.push({
                typeOf: 'Discount',
                name: 'ムビチケカード',
                discount: (<factory.action.authorize.discount.mvtk.IResult>mvtkAuthorizeAction.result).price,
                discountCode: discountCode,
                discountCurrency: factory.priceCurrency.JPY
            });
        });

    const paymentMethods: factory.order.IPaymentMethod<factory.paymentMethodType>[] = [];

    // 決済方法をセット
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.result !== undefined)
                .filter((a) => a.result.paymentMethod === paymentMethodType)
                .forEach((a: factory.action.authorize.paymentMethod.any.IAction<factory.paymentMethodType>) => {
                    const result = (<factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>>a.result);
                    paymentMethods.push({
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: paymentMethodType
                    });
                });
        });

    // ムビチケ割引があれば決済方法に追加
    params.transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.discount.mvtk.ObjectType.Mvtk)
        .forEach((mvtkAuthorizeAction: factory.action.authorize.discount.mvtk.IAction) => {
            // ムビチケ購入管理番号を決済IDに指定
            paymentMethods.push(...mvtkAuthorizeAction.object.seatInfoSyncIn.knyknrNoInfo.map(
                (knshInfo) => {
                    return {
                        name: 'ムビチケ',
                        typeOf: factory.paymentMethodType.MovieTicket,
                        paymentMethod: factory.paymentMethodType.MovieTicket,
                        paymentMethodId: knshInfo.knyknrNo,
                        additionalProperty: []
                    };
                }
            ));
        });

    const url = '';

    // 決済方法から注文金額の計算
    let price = 0;
    Object.keys(factory.paymentMethodType)
        .forEach((key) => {
            const paymentMethodType = <factory.paymentMethodType>(<any>factory.paymentMethodType)[key];
            price += params.transaction.object.authorizeActions
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
                .filter((a) => a.object.typeOf === paymentMethodType)
                .filter((a) => {
                    const totalPaymentDue = (<IAuthorizeAnyPaymentResult>a.result).totalPaymentDue;

                    return totalPaymentDue !== undefined && totalPaymentDue.currency === factory.priceCurrency.JPY;
                })
                .reduce((a, b) => a + (<IAuthorizeAnyPaymentResult>b.result).amount, 0);
        });

    return {
        project: params.project,
        typeOf: 'Order',
        seller: seller,
        customer: customer,
        price: price,
        priceCurrency: factory.priceCurrency.JPY,
        paymentMethods: paymentMethods,
        discounts: discounts,
        confirmationNumber: '',
        orderNumber: '',
        acceptedOffers: acceptedOffers,
        url: url,
        orderStatus: params.orderStatus,
        orderDate: params.orderDate,
        isGift: params.isGift
    };
}

/**
 * イベントオファー適用条件確認
 */
export function validateEventOffers(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
}) {
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    seatReservationAuthorizeActions.forEach((a) => {
        const acceptedOffers = a.object.acceptedOffer;

        // オファーIDごとにオファー適用条件を確認
        const offerIds = [...new Set(acceptedOffers.map((o) => o.id))];
        offerIds.forEach((offerId) => {
            const acceptedOffersByOfferId = acceptedOffers.filter((o) => o.id === offerId);
            let acceptedOffer = acceptedOffersByOfferId[0];

            let unitPriceSpec: IUnitPriceSpecification | undefined;
            if (acceptedOffer.priceSpecification !== undefined) {
                // Chevre予約の場合、priceSpecificationに複合価格仕様が含まれるので、そこから単価仕様を取り出す
                acceptedOffer = <factory.action.authorize.offer.seatReservation.IAcceptedOffer4chevre>acceptedOffer;
                unitPriceSpec = <IUnitPriceSpecification>acceptedOffer.priceSpecification.priceComponent.find(
                    (spec) => spec.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
                );
            }

            // 適用金額要件を満たしていなければエラー
            if (unitPriceSpec !== undefined) {
                if (unitPriceSpec.eligibleTransactionVolume !== undefined) {
                    if (typeof unitPriceSpec.eligibleTransactionVolume.price === 'number') {
                        if (params.order.price < unitPriceSpec.eligibleTransactionVolume.price) {
                            throw new factory.errors.Argument(
                                'Transaction',
                                format(
                                    'Transaction volume must be more than or equal to %s %s for offer:%s',
                                    unitPriceSpec.eligibleTransactionVolume.price,
                                    unitPriceSpec.eligibleTransactionVolume.priceCurrency,
                                    offerId
                                )
                            );
                        }
                    }
                }
            }
        });
    });
}

/**
 * 取引のポストアクションを作成する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function createPotentialActionsFromTransaction(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    seller: ISeller;
    sendEmailMessage?: boolean;
    email?: factory.creativeWork.message.email.ICustomization;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): Promise<factory.transaction.placeOrder.IPotentialActions> {
    const project: factory.project.IProject = (params.transaction.project !== undefined)
        ? params.transaction.project
        : { typeOf: 'Project', id: <string>process.env.PROJECT_ID };

    // 予約確定アクション
    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);
    const confirmReservationActions: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>[] = [];
    let confirmReservationParams: factory.transaction.placeOrder.IConfirmReservationParams[] = [];
    if (params.potentialActions !== undefined
        && params.potentialActions.order !== undefined
        && params.potentialActions.order.potentialActions !== undefined
        && params.potentialActions.order.potentialActions.sendOrder !== undefined
        && params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined
        && Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.confirmReservation)) {
        confirmReservationParams =
            params.potentialActions.order.potentialActions.sendOrder.potentialActions.confirmReservation;
    }

    // tslint:disable-next-line:max-func-body-length
    seatReservationAuthorizeActions.forEach((a) => {
        const actionResult = a.result;

        if (a.instrument === undefined) {
            a.instrument = {
                typeOf: 'WebAPI',
                identifier: factory.service.webAPI.Identifier.Chevre
            };
        }

        if (actionResult !== undefined) {
            const requestBody = actionResult.requestBody;
            let responseBody = actionResult.responseBody;

            switch (a.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // tslint:disable-next-line:max-line-length
                    responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                    const updTmpReserveSeatArgs = requestBody;
                    const updTmpReserveSeatResult = responseBody;

                    // 電話番号のフォーマットを日本人にリーダブルに調整(COAではこのフォーマットで扱うので)
                    const phoneUtil = PhoneNumberUtil.getInstance();
                    const phoneNumber = phoneUtil.parse(params.order.customer.telephone, 'JP');
                    let telNum = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);

                    // COAでは数字のみ受け付けるので数字以外を除去
                    telNum = telNum.replace(/[^\d]/g, '');

                    const mailAddr = params.order.customer.email;
                    if (mailAddr === undefined) {
                        throw new factory.errors.Argument('order', 'order.customer.email undefined');
                    }

                    const updReserveArgs: factory.action.interact.confirm.reservation.IObject4COA = {
                        theaterCode: updTmpReserveSeatArgs.theaterCode,
                        dateJouei: updTmpReserveSeatArgs.dateJouei,
                        titleCode: updTmpReserveSeatArgs.titleCode,
                        titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                        timeBegin: updTmpReserveSeatArgs.timeBegin,
                        tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum,
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveName: `${params.order.customer.familyName}　${params.order.customer.givenName}`,
                        // tslint:disable-next-line:no-irregular-whitespace
                        reserveNameJkana: `${params.order.customer.familyName}　${params.order.customer.givenName}`,
                        telNum: telNum,
                        mailAddr: mailAddr,
                        reserveAmount: params.order.price, // デフォルトのpriceCurrencyがJPYなのでこれでよし
                        listTicket: params.order.acceptedOffers.map(
                            // tslint:disable-next-line:max-line-length
                            (offer) => {
                                const itemOffered = <factory.order.IReservation>offer.itemOffered;

                                let coaTicketInfo: COA.services.reserve.IUpdReserveTicket | undefined;
                                if (itemOffered.reservedTicket.coaTicketInfo !== undefined) {
                                    coaTicketInfo = itemOffered.reservedTicket.coaTicketInfo;
                                } else {
                                    const additionalProperty = itemOffered.reservedTicket.ticketType.additionalProperty;
                                    if (additionalProperty === undefined) {
                                        throw new factory.errors.NotFound('ticketType.additionalProperty');
                                    }

                                    const coaInfoProperty = additionalProperty.find((p) => p.name === 'coaInfo');
                                    if (coaInfoProperty === undefined) {
                                        throw new factory.errors.NotFound('coaInfo');
                                    }

                                    coaTicketInfo = JSON.parse(coaInfoProperty.value);
                                }

                                if (coaTicketInfo === undefined) {
                                    throw new factory.errors.NotFound('COA Ticket Info');
                                }

                                return coaTicketInfo;
                            }
                        )
                    };

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: updReserveArgs,
                        agent: params.transaction.agent,
                        purpose: {
                            typeOf: params.order.typeOf,
                            seller: params.order.seller,
                            customer: params.order.customer,
                            confirmationNumber: params.order.confirmationNumber,
                            orderNumber: params.order.orderNumber,
                            price: params.order.price,
                            priceCurrency: params.order.priceCurrency,
                            orderDate: params.order.orderDate
                        },
                        instrument: a.instrument
                    });

                    break;

                default:
                    // tslint:disable-next-line:max-line-length
                    // responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    // tslint:disable-next-line:max-line-length
                    const reserveTransaction = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;
                    const defaultUnderNameIdentifiers: factory.propertyValue.IPropertyValue<string>[]
                        = [{ name: 'orderNumber', value: params.order.orderNumber }];

                    const confirmReservationObject:
                        factory.action.interact.confirm.reservation.IObject<factory.service.webAPI.Identifier.Chevre> = {
                        typeOf: factory.chevre.transactionType.Reserve,
                        id: reserveTransaction.id,
                        object: {
                            reservations: reserveTransaction.object.reservations.map((r) => {
                                // 購入者や販売者の情報を連携する
                                return {
                                    id: r.id,
                                    reservedTicket: {
                                        issuedBy: {
                                            typeOf: params.order.seller.typeOf,
                                            name: params.order.seller.name
                                        }
                                    },
                                    underName: {
                                        typeOf: params.order.customer.typeOf,
                                        id: params.order.customer.id,
                                        name: String(params.order.customer.name),
                                        familyName: params.order.customer.familyName,
                                        givenName: params.order.customer.givenName,
                                        email: params.order.customer.email,
                                        telephone: params.order.customer.telephone,
                                        identifier: defaultUnderNameIdentifiers
                                    }
                                };
                            })
                        }
                    };

                    const confirmReservationObjectParams = confirmReservationParams.find((p) => {
                        const object = <factory.action.interact.confirm.reservation.IObject4Chevre>p.object;

                        return object !== undefined
                            && object.typeOf === factory.chevre.transactionType.Reserve
                            && object.id === reserveTransaction.id;
                    });
                    // 予約確定パラメータの指定があれば上書きする
                    if (confirmReservationObjectParams !== undefined) {
                        const customizedConfirmReservationObject =
                            <factory.action.interact.confirm.reservation.IObject4Chevre>confirmReservationObjectParams.object;

                        // 予約取引確定オブジェクトの指定があれば上書き
                        if (customizedConfirmReservationObject.object !== undefined) {
                            if (Array.isArray(customizedConfirmReservationObject.object.reservations)) {
                                customizedConfirmReservationObject.object.reservations.forEach((r) => {
                                    if (r.underName !== undefined && Array.isArray(r.underName.identifier)) {
                                        r.underName.identifier.push(...defaultUnderNameIdentifiers);
                                    }

                                    if (r.reservedTicket !== undefined
                                        && r.reservedTicket.underName !== undefined
                                        && Array.isArray(r.reservedTicket.underName.identifier)) {
                                        r.reservedTicket.underName.identifier.push(...defaultUnderNameIdentifiers);
                                    }
                                });
                            }

                            confirmReservationObject.object = customizedConfirmReservationObject.object;
                        }

                        // 予約取引確定後アクションの指定があれば上書き
                        const confirmReservePotentialActions = customizedConfirmReservationObject.potentialActions;
                        if (confirmReservePotentialActions !== undefined
                            && confirmReservePotentialActions.reserve !== undefined
                            && confirmReservePotentialActions.reserve.potentialActions !== undefined
                            && Array.isArray(confirmReservePotentialActions.reserve.potentialActions.informReservation)) {
                            confirmReservationObject.potentialActions = {
                                reserve: {
                                    potentialActions: {
                                        informReservation: confirmReservePotentialActions.reserve.potentialActions.informReservation
                                    }
                                }
                            };
                        }
                    }

                    confirmReservationActions.push({
                        project: params.transaction.project,
                        typeOf: <factory.actionType.ConfirmAction>factory.actionType.ConfirmAction,
                        object: confirmReservationObject,
                        agent: params.transaction.agent,
                        purpose: {
                            typeOf: params.order.typeOf,
                            seller: params.order.seller,
                            customer: params.order.customer,
                            confirmationNumber: params.order.confirmationNumber,
                            orderNumber: params.order.orderNumber,
                            price: params.order.price,
                            priceCurrency: params.order.priceCurrency,
                            orderDate: params.order.orderDate
                        },
                        instrument: a.instrument
                    });
            }
        }
    });

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
                project: params.transaction.project,
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: <factory.paymentMethodType.CreditCard>result.paymentMethod
                    },
                    price: result.amount,
                    priceCurrency: factory.priceCurrency.JPY,
                    entryTranArgs: result.entryTranArgs,
                    execTranArgs: result.execTranArgs
                }],
                agent: params.transaction.agent,
                purpose: {
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                }
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
                project: params.transaction.project,
                typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
                object: [{
                    typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                    paymentMethod: {
                        accountId: result.accountId,
                        additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                        name: result.name,
                        paymentMethodId: result.paymentMethodId,
                        totalPaymentDue: result.totalPaymentDue,
                        typeOf: <factory.paymentMethodType.Account>result.paymentMethod
                    },
                    pendingTransaction:
                        (<factory.action.authorize.paymentMethod.account.IResult<factory.accountType>>a.result).pendingTransaction
                }],
                agent: params.transaction.agent,
                purpose: {
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                }
            };
        });

    // ムビチケ決済アクション
    // ムビチケ着券は、注文単位でまとめて実行しないと失敗するので注意
    const authorizeMovieTicketActions = <factory.action.authorize.paymentMethod.movieTicket.IAction[]>
        params.transaction.object.authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.result !== undefined)
            .filter((a) => a.result.paymentMethod === factory.paymentMethodType.MovieTicket)
            // PaymentDueステータスのアクションのみ、着券アクションをセット
            // 着券済の場合は、PaymentCompleteステータス
            .filter((a) => {
                const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

                return result.paymentStatus === factory.paymentStatusType.PaymentDue;
            });
    const payMovieTicketActions: factory.action.trade.pay.IAttributes<factory.paymentMethodType.MovieTicket>[] = [];
    if (authorizeMovieTicketActions.length > 0) {
        payMovieTicketActions.push({
            project: params.transaction.project,
            typeOf: <factory.actionType.PayAction>factory.actionType.PayAction,
            object: authorizeMovieTicketActions
                .map((a) => {
                    const result = <factory.action.authorize.paymentMethod.movieTicket.IResult>a.result;

                    return {
                        typeOf: <factory.action.trade.pay.TypeOfObject>'PaymentMethod',
                        paymentMethod: {
                            accountId: result.accountId,
                            additionalProperty: (Array.isArray(result.additionalProperty)) ? result.additionalProperty : [],
                            name: result.name,
                            paymentMethodId: result.paymentMethodId,
                            totalPaymentDue: result.totalPaymentDue,
                            typeOf: <factory.paymentMethodType.MovieTicket>result.paymentMethod
                        },
                        movieTickets: a.object.movieTickets
                    };
                }),
            agent: params.transaction.agent,
            purpose: {
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
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
            project: params.transaction.project,
            typeOf: <factory.actionType.GiveAction>factory.actionType.GiveAction,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            object: {
                typeOf: factory.action.transfer.give.pointAward.ObjectType.PointAward,
                pointTransaction: actionResult.pointTransaction,
                pointAPIEndpoint: actionResult.pointAPIEndpoint
            },
            purpose: {
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
        };
    });

    // メール送信ONであれば送信アクション属性を生成
    let sendEmailMessageActionAttributes: factory.action.transfer.send.message.email.IAttributes | null = null;
    if (params.sendEmailMessage === true) {
        const emailMessage = await emailMessageBuilder.createSendOrderMessage({
            project: project,
            order: params.order,
            email: params.email
        });
        sendEmailMessageActionAttributes = {
            project: params.transaction.project,
            typeOf: factory.actionType.SendAction,
            object: emailMessage,
            agent: params.transaction.seller,
            recipient: params.transaction.agent,
            potentialActions: {},
            purpose: {
                typeOf: params.order.typeOf,
                seller: params.order.seller,
                customer: params.order.customer,
                confirmationNumber: params.order.confirmationNumber,
                orderNumber: params.order.orderNumber,
                price: params.order.price,
                priceCurrency: params.order.priceCurrency,
                orderDate: params.order.orderDate
            }
        };
    }

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions = createRegisterProgramMembershipActions(params);

    const informOrderActionsOnPlaceOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];
    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (Array.isArray(params.potentialActions.order.potentialActions.informOrder)) {
                    params.potentialActions.order.potentialActions.informOrder.forEach((a) => {
                        if (a.recipient !== undefined) {
                            if (typeof a.recipient.url === 'string') {
                                informOrderActionsOnPlaceOrder.push({
                                    agent: params.transaction.seller,
                                    object: params.order,
                                    project: params.transaction.project,
                                    // purpose: params.transaction,
                                    recipient: {
                                        id: params.transaction.agent.id,
                                        name: params.transaction.agent.name,
                                        typeOf: params.transaction.agent.typeOf,
                                        url: a.recipient.url
                                    },
                                    typeOf: factory.actionType.InformAction
                                });
                            }
                        }
                    });
                }
            }
        }
    }

    const informOrderActionsOnSentOrder: factory.action.interact.inform.IAttributes<any, any>[] = [];
    if (params.potentialActions !== undefined) {
        if (params.potentialActions.order !== undefined) {
            if (params.potentialActions.order.potentialActions !== undefined) {
                if (params.potentialActions.order.potentialActions.sendOrder !== undefined) {
                    if (params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined) {
                        if (Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder)) {
                            params.potentialActions.order.potentialActions.sendOrder.potentialActions.informOrder.forEach((a) => {
                                if (a.recipient !== undefined) {
                                    if (typeof a.recipient.url === 'string') {
                                        informOrderActionsOnSentOrder.push({
                                            agent: params.transaction.seller,
                                            object: params.order,
                                            project: params.transaction.project,
                                            // purpose: params.transaction,
                                            recipient: {
                                                id: params.transaction.agent.id,
                                                name: params.transaction.agent.name,
                                                typeOf: params.transaction.agent.typeOf,
                                                url: a.recipient.url
                                            },
                                            typeOf: factory.actionType.InformAction
                                        });
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    const sendOrderActionAttributes: factory.action.transfer.send.order.IAttributes = {
        project: params.transaction.project,
        typeOf: factory.actionType.SendAction,
        object: params.order,
        agent: params.transaction.seller,
        recipient: params.transaction.agent,
        potentialActions: {
            confirmReservation: confirmReservationActions,
            informOrder: informOrderActionsOnSentOrder,
            registerProgramMembership: registerProgramMembershipActions,
            sendEmailMessage: (sendEmailMessageActionAttributes !== null) ? sendEmailMessageActionAttributes : undefined
        }
    };

    return {
        order: {
            project: params.transaction.project,
            typeOf: factory.actionType.OrderAction,
            object: params.order,
            agent: params.transaction.agent,
            potentialActions: {
                givePointAward: givePointAwardActions,
                informOrder: informOrderActionsOnPlaceOrder,
                payAccount: payAccountActions,
                payCreditCard: payCreditCardActions,
                payMovieTicket: payMovieTicketActions,
                sendOrder: sendOrderActionAttributes
            },
            purpose: {
                typeOf: params.transaction.typeOf,
                id: params.transaction.id
            }
        }
    };
}

// tslint:disable-next-line:max-func-body-length
export function createRegisterProgramMembershipActions(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): factory.action.interact.register.programMembership.IAttributes[] {
    const project: factory.project.IProject = (params.transaction.project !== undefined)
        ? params.transaction.project
        : { typeOf: 'Project', id: <string>process.env.PROJECT_ID };

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions: factory.action.interact.register.programMembership.IAttributes[] = [];
    const programMembershipOffers = <factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>[]>
        params.order.acceptedOffers.filter(
            (o) => o.itemOffered.typeOf === <factory.programMembership.ProgramMembershipType>'ProgramMembership'
        );
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipOffers.length > 0) {
        registerProgramMembershipActions.push(...programMembershipOffers.map((o) => {
            const programMembership = o.itemOffered;

            // 次回の会員プログラム注文タスクを生成
            const orderProgramMembershipTaskData: factory.task.IData<factory.taskName.OrderProgramMembership> = {
                agent: params.transaction.agent,
                object: o,
                // 注文確定後アクションは、次回も同様に設定
                potentialActions: params.potentialActions,
                project: project,
                sendEmailMessage: false,
                typeOf: factory.actionType.OrderAction
            };

            // アクションカスタマイズの指定があれば適用
            if (params.potentialActions !== undefined
                && params.potentialActions.order !== undefined
                && params.potentialActions.order.potentialActions !== undefined
                && params.potentialActions.order.potentialActions.sendOrder !== undefined
                && params.potentialActions.order.potentialActions.sendOrder.potentialActions !== undefined
                && Array.isArray(params.potentialActions.order.potentialActions.sendOrder.potentialActions.registerProgramMembership)) {
                const registerParams =
                    params.potentialActions.order.potentialActions.sendOrder.potentialActions.registerProgramMembership.find((r) => {
                        return r.object !== undefined
                            && r.object.id === programMembership.id
                            && r.object.typeOf === programMembership.typeOf;
                    });
                if (registerParams !== undefined) {
                    const registerPotentialActions = registerParams.potentialActions;
                    if (registerPotentialActions !== undefined
                        && registerPotentialActions.orderProgramMembership !== undefined
                        && registerPotentialActions.orderProgramMembership.potentialActions !== undefined
                        && registerPotentialActions.orderProgramMembership.potentialActions.order !== undefined
                        && registerPotentialActions.orderProgramMembership.potentialActions.order.potentialActions !== undefined) {
                        const orderProgramMembershipPotentialActions =
                            registerPotentialActions.orderProgramMembership.potentialActions.order.potentialActions;
                        if (orderProgramMembershipPotentialActions.sendOrder !== undefined
                            && orderProgramMembershipPotentialActions.sendOrder.potentialActions !== undefined
                            && Array.isArray(orderProgramMembershipPotentialActions.sendOrder.potentialActions.sendEmailMessage)) {
                            const sendEmailMessage =
                                orderProgramMembershipPotentialActions.sendOrder.potentialActions.sendEmailMessage.shift();
                            if (sendEmailMessage !== undefined && sendEmailMessage.object !== undefined) {
                                orderProgramMembershipTaskData.sendEmailMessage = true;
                                orderProgramMembershipTaskData.email = sendEmailMessage.object;
                            }
                        }
                    }
                }
            }

            // どういう期間でいくらのオファーなのか
            const eligibleDuration = o.eligibleDuration;
            if (eligibleDuration === undefined) {
                throw new factory.errors.NotFound('Order.acceptedOffers.eligibleDuration');
            }
            // 期間単位としては秒のみ実装
            if (eligibleDuration.unitCode !== factory.unitCode.Sec) {
                throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for eligibleDuration.unitCode ');
            }
            // プログラム更新日時は、今回のプログラムの所有期限
            const runsAt = moment(params.order.orderDate)
                .add(eligibleDuration.value, 'seconds')
                .toDate();

            const orderProgramMembershipTask: factory.task.IAttributes<factory.taskName.OrderProgramMembership> = {
                data: orderProgramMembershipTaskData,
                executionResults: [],
                name: <factory.taskName.OrderProgramMembership>factory.taskName.OrderProgramMembership,
                numberOfTried: 0,
                project: project,
                remainingNumberOfTries: 10,
                runsAt: runsAt,
                status: factory.taskStatus.Ready
            };

            return {
                agent: params.transaction.agent,
                object: {
                    typeOf: programMembership.typeOf,
                    id: programMembership.id,
                    hostingOrganization: programMembership.hostingOrganization,
                    name: programMembership.name,
                    programName: programMembership.programName,
                    project: programMembership.project,
                    award: programMembership.award
                },
                potentialActions: {
                    orderProgramMembership: [orderProgramMembershipTask]
                },
                project: project,
                purpose: {
                    typeOf: params.order.typeOf,
                    orderNumber: params.order.orderNumber
                },
                typeOf: <factory.actionType.RegisterAction>factory.actionType.RegisterAction
            };
        }));
    }

    return registerProgramMembershipActions;
}
