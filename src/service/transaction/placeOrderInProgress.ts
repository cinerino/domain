/**
 * 進行中注文取引サービス
 */
import * as waiter from '@waiter/domain';
import * as createDebug from 'debug';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
import { format } from 'util';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as AuthorizePointAwardActionService from './placeOrderInProgress/action/authorize/award/point';
import * as AuthorizeMvtkDiscountActionService from './placeOrderInProgress/action/authorize/discount/mvtk';
import * as ProgramMembershipAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/programMembership';
import * as AuthorizeSeatReservationActionService from './placeOrderInProgress/action/authorize/offer/seatReservation';
import * as AuthorizeSeatReservation4coaActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4coa';
import * as AuthorizeSeatReservation4tttsActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4ttts';

import { createPotentialActions } from './placeOrderInProgress/potentialActions';
import { createOrder } from './placeOrderInProgress/result';

const debug = createDebug('cinerino-domain:service');
export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type IStartOperation<T> = (repos: {
    project: ProjectRepo;
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;

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

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

/**
 * 取引開始
 */
// tslint:disable-next-line:max-func-body-length
export function start(params: IStartParams): IStartOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
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

        // 注文通知パラメータ作成
        const informOrderParams: factory.transaction.placeOrder.IInformOrderParams[] = [];

        if (project.settings !== undefined
            && project.settings !== null
            && project.settings.onOrderStatusChanged !== undefined
            && Array.isArray(project.settings.onOrderStatusChanged.informOrder)) {
            informOrderParams.push(...project.settings.onOrderStatusChanged.informOrder);
        }

        if (params.object !== undefined
            && params.object.onOrderStatusChanged !== undefined
            && Array.isArray(params.object.onOrderStatusChanged.informOrder)) {
            informOrderParams.push(...params.object.onOrderStatusChanged.informOrder);
        }

        const transactionObject: factory.transaction.placeOrder.IObject = {
            passportToken: (params.object.passport !== undefined) ? params.object.passport.token : undefined,
            passport: passport,
            authorizeActions: [],
            onOrderStatusChanged: {
                informOrder: informOrderParams
            },
            ...((<any>params.object).clientUser !== undefined && (<any>params.object).clientUser !== null)
                ? { clientUser: (<any>params.object).clientUser }
                : undefined
        };

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const transactionAttributes: factory.transaction.placeOrder.IAttributes = {
            project: { typeOf: 'Project', id: params.project.id },
            typeOf: factory.transactionType.PlaceOrder,
            status: factory.transactionStatusType.InProgress,
            agent: params.agent,
            seller: {
                project: seller.project,
                id: seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            object: transactionObject,
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
            /**
             * 座席予約承認アクションサービス(ttts専用)
             */
            export import seatReservation4ttts = AuthorizeSeatReservation4tttsActionService;
        }
    }
}

/**
 * 顧客プロフィール更新
 */
export function updateAgent(params: {
    id: string;
    agent: factory.transaction.placeOrder.IAgent & {
        telephoneRegion?: string;
    };
}): ITransactionOperation<factory.transaction.placeOrder.IAgent> {
    return async (repos: { transaction: TransactionRepo }) => {
        let formattedTelephone: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.agent.telephone, params.agent.telephoneRegion);
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('telephone', error.message);
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 新プロフィール作成
        const newAgent: factory.transaction.placeOrder.IAgent = {
            typeOf: transaction.agent.typeOf,
            id: transaction.agent.id,
            ...(Array.isArray(params.agent.additionalProperty)) ? { additionalProperty: params.agent.additionalProperty } : {},
            ...(typeof params.agent.age === 'string') ? { age: params.agent.age } : {},
            ...(typeof params.agent.address === 'string') ? { address: params.agent.address } : {},
            ...(typeof params.agent.email === 'string') ? { email: params.agent.email } : {},
            ...(typeof params.agent.familyName === 'string') ? { familyName: params.agent.familyName } : {},
            ...(typeof params.agent.gender === 'string') ? { gender: params.agent.gender } : {},
            ...(typeof params.agent.givenName === 'string') ? { givenName: params.agent.givenName } : {},
            ...(typeof params.agent.name === 'string') ? { name: params.agent.name } : {},
            ...(typeof formattedTelephone === 'string') ? { telephone: formattedTelephone } : {},
            ...(typeof params.agent.url === 'string') ? { url: params.agent.url } : {}
        };

        await repos.transaction.updateAgent({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id,
            agent: newAgent
        });

        return newAgent;
    };
}

export type IConfirmationNumberGenerator = (order: factory.order.IOrder) => string;

export type IOrderURLGenerator = (order: factory.order.IOrder) => string;

export type IResultOrderParams = factory.transaction.placeOrder.IResultOrderParams & {
    /**
     * 注文日時
     */
    orderDate: Date;
    /**
     * 確認番号のカスタム指定
     */
    confirmationNumber?: string | IConfirmationNumberGenerator;
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
};

export type IConfirmParams = factory.transaction.placeOrder.IConfirmParams & {
    project: factory.chevre.project.IProject;
    result: {
        order: IResultOrderParams;
    };
    /**
     * ムビチケバリデーションを適用するかどうか
     */
    validateMovieTicket?: boolean;
};

/**
 * 注文取引を確定する
 */
export function confirm(params: IConfirmParams) {
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
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
                throw new factory.errors.Forbidden('Transaction not yours');
            }
        }

        const project: factory.project.IProject = transaction.project;

        const seller = await repos.seller.findById({ id: transaction.seller.id });

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
        const order = createOrder({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            transaction: transaction,
            orderDate: params.result.order.orderDate,
            orderStatus: factory.orderStatus.OrderProcessing,
            isGift: false
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

        // 識別子の指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (Array.isArray(params.result.order.identifier)) {
            order.identifier = params.result.order.identifier;
        }

        const result: factory.transaction.placeOrder.IResult = { order };

        // ポストアクションを作成
        const potentialActions = await createPotentialActions({
            transaction: transaction,
            order: order,
            seller: seller,
            potentialActions: params.potentialActions
        });

        // ステータス変更
        try {
            transaction = await repos.transaction.confirm({
                typeOf: transaction.typeOf,
                id: transaction.id,
                authorizeActions: authorizeActions,
                result: result,
                potentialActions: potentialActions
            });
        } catch (error) {
            if (error.name === 'MongoError') {
                // 万が一同一注文番号で確定しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error collection: prodttts.transactions index:result.order.orderNumber_1 dup key:...',
                // code: 11000,
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['result.order.orderNumber']);
                }
            }

            throw error;
        }

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
        if (a.object.event === undefined
            || a.object.event === null) {
            throw new factory.errors.ServiceUnavailable('Authorized event undefined');
        }
        const event = a.object.event;

        const acceptedOffer =
            (<factory.action.authorize.offer.seatReservation.IObject<factory.service.webAPI.Identifier.Chevre>>a.object).acceptedOffer;
        acceptedOffer.forEach((offer: factory.chevre.event.screeningEvent.IAcceptedTicketOffer) => {
            const offeredTicketedSeat = offer.ticketedSeat;
            if (offeredTicketedSeat !== undefined) {
                offer.priceSpecification.priceComponent.forEach((component) => {
                    // ムビチケ券種区分チャージ仕様があれば検証リストに追加
                    if (component.typeOf === factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification) {
                        requiredMovieTickets.push({
                            project: transaction.project,
                            typeOf: factory.paymentMethodType.MovieTicket,
                            identifier: '',
                            accessCode: '',
                            serviceType: component.appliesToMovieTicketType,
                            serviceOutput: {
                                reservationFor: { typeOf: event.typeOf, id: event.id },
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
