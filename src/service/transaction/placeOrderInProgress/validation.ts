/**
 * 注文取引バリデーション
 */
import * as waiter from '@waiter/domain';
import * as createDebug from 'debug';
import { format } from 'util';

import * as factory from '../../../factory';

const debug = createDebug('cinerino-domain:service');
export type IAuthorizeAnyPaymentResult = factory.action.authorize.paymentMethod.any.IResult<factory.paymentMethodType>;

export type IPassportValidator = (params: { passport: factory.waiter.passport.IPassport }) => boolean;
export type IStartParams = factory.transaction.placeOrder.IStartParamsWithoutDetail & {
    passportValidator?: IPassportValidator;
};

export type IAuthorizeSeatReservationOffer = factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>;
export type IAuthorizeSeatReservationOfferResult =
    factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier>;

export type IAuthorizePointAccountPayment = factory.action.authorize.paymentMethod.account.IAccount;

export type IAuthorizeActionResultBySeller =
    factory.action.authorize.offer.product.IResult |
    IAuthorizeSeatReservationOfferResult |
    factory.action.authorize.award.point.IResult;

export type IUnitPriceSpecification =
    factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>;

export async function validateWaiterPassport(params: IStartParams): Promise<factory.waiter.passport.IPassport | undefined> {
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

    return passport;
}

/**
 * 取引が確定可能な状態かどうかをチェックする
 */
export function validateTransaction(transaction: factory.transaction.placeOrder.ITransaction) {
    validateProfile(transaction);
    validatePrice(transaction);
    validateAccount(transaction);

    // tslint:disable-next-line:no-suspicious-comment
    // TODO 利用可能なムビチケ系統決済方法タイプに対して動的にコーディング
    validateMovieTicket(factory.paymentMethodType.MovieTicket, transaction);
    validateMovieTicket(factory.paymentMethodType.MGTicket, transaction);
}

function validateProfile(transaction: factory.transaction.placeOrder.ITransaction) {
    const profile = transaction.agent;

    if (typeof profile.email !== 'string' || profile.email.length === 0
        || typeof profile.familyName !== 'string' || profile.familyName.length === 0
        || typeof profile.givenName !== 'string' || profile.givenName.length === 0
        || typeof profile.telephone !== 'string' || profile.telephone.length === 0) {
        throw new factory.errors.Argument('Transaction', 'Customer Profile Required');
    }
}

function validatePrice(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;
    let priceByAgent = 0;
    let priceBySeller = 0;

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

    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('Transaction', 'Transaction cannot be confirmed because prices are not matched');
    }
}

function validateAccount(transaction: factory.transaction.placeOrder.ITransaction) {
    const authorizeActions = transaction.object.authorizeActions;
    const authorizeMonetaryAmountActions = (<factory.action.authorize.paymentMethod.account.IAction[]>authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.paymentMethodType.Account);

    const requiredMonetaryAmountByAccountType: {
        currency: string;
        value: number;
    }[] = [];

    (<IAuthorizeSeatReservationOffer[]>authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
        .forEach(
            (a) => {
                const amount = (<IAuthorizeSeatReservationOfferResult>a.result).amount;
                if (Array.isArray(amount)) {
                    amount.forEach((monetaryAmount) => {
                        if (typeof monetaryAmount.value === 'number') {
                            requiredMonetaryAmountByAccountType.push({ currency: monetaryAmount.currency, value: monetaryAmount.value });
                        }
                    });
                }
            },
            0
        );

    const requiredAccountTypes = [...new Set(requiredMonetaryAmountByAccountType.map((m) => m.currency))];
    const authorizedAccountTypes = [...new Set(authorizeMonetaryAmountActions.map(
        (m) => (<IAuthorizePointAccountPayment>m.object.fromAccount).accountType
    ))];

    if (requiredAccountTypes.length !== authorizedAccountTypes.length) {
        throw new factory.errors.Argument('Transaction', 'MonetaryAmount account types not matched');
    }

    const requireMonetaryAmountSatisfied = requiredAccountTypes.every((accountType) => {
        const requiredMonetaryAmount = requiredMonetaryAmountByAccountType.filter((m) => m.currency === accountType)
            .reduce((a, b) => a + b.value, 0);

        const authorizedMonetaryAmount = authorizeMonetaryAmountActions
            .filter((a) => (<IAuthorizePointAccountPayment>a.object.fromAccount).accountType === accountType)
            .reduce((a, b) => a + b.object.amount, 0);

        return requiredMonetaryAmount === authorizedMonetaryAmount;
    });

    if (!requireMonetaryAmountSatisfied) {
        throw new factory.errors.Argument('Transaction', 'Required MonetaryAmount not satisfied');
    }
}

/**
 * 座席予約オファー承認に対してムビチケ承認条件が整っているかどうか検証する
 */
// tslint:disable-next-line:max-func-body-length
function validateMovieTicket(
    paymentMethodType: factory.paymentMethodType.MovieTicket | factory.paymentMethodType.MGTicket,
    transaction: factory.transaction.placeOrder.ITransaction
) {
    const authorizeActions = transaction.object.authorizeActions;

    const authorizeMovieTicketActions = <factory.action.authorize.paymentMethod.movieTicket.IAction[]>authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.object.typeOf === paymentMethodType);

    const seatReservationAuthorizeActions = <IAuthorizeSeatReservationOffer[]>
        authorizeActions
            .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
            .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation);

    // ムビチケオファーを受け付けた座席予約を検索する
    const requiredMovieTickets: factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
    seatReservationAuthorizeActions.forEach((a) => {
        if (a.object.event === undefined
            || a.object.event === null) {
            throw new factory.errors.ServiceUnavailable('Authorized event undefined');
        }
        const event = a.object.event;

        const acceptedOffer =
            (<factory.action.authorize.offer.seatReservation.IObject<factory.service.webAPI.Identifier.Chevre>>a.object).acceptedOffer;
        acceptedOffer.forEach((offer: factory.chevre.event.screeningEvent.IAcceptedTicketOffer) => {
            let offeredTicketedSeat = (<any>offer).ticketedSeat;
            const acceptedTicketedSeatByItemOffered = offer.itemOffered?.serviceOutput?.reservedTicket?.ticketedSeat;
            if (acceptedTicketedSeatByItemOffered !== undefined && acceptedTicketedSeatByItemOffered !== null) {
                offeredTicketedSeat = acceptedTicketedSeatByItemOffered;
            }

            if (offeredTicketedSeat !== undefined) {
                const ticketedSeat4MovieTicket = offeredTicketedSeat;

                offer.priceSpecification.priceComponent.forEach((component) => {
                    // ムビチケ券種区分チャージ仕様があれば検証リストに追加
                    if (component.typeOf === factory.chevre.priceSpecificationType.MovieTicketTypeChargeSpecification
                        && component.appliesToMovieTicket?.typeOf === paymentMethodType) {
                        // 互換性維持対応
                        let serviceType: string = (<any>component).appliesToMovieTicketType;
                        if (typeof component.appliesToMovieTicket?.serviceType === 'string') {
                            serviceType = component.appliesToMovieTicket.serviceType;
                        }

                        requiredMovieTickets.push({
                            project: { typeOf: transaction.project.typeOf, id: transaction.project.id },
                            typeOf: <any>paymentMethodType,
                            identifier: '',
                            accessCode: '',
                            serviceType: serviceType,
                            serviceOutput: {
                                reservationFor: { typeOf: event.typeOf, id: event.id },
                                reservedTicket: { ticketedSeat: ticketedSeat4MovieTicket }
                            }
                        });
                    }
                });
            }
        });
    });
    debug(requiredMovieTickets.length, 'movie tickets required');

    const authorizedMovieTickets: factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
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

export function validateNumItems(params: {
    order: factory.order.IOrder;
    result: {
        order: IResultOrderParams;
    };
}) {
    // 注文アイテム数制限確認
    if (params.result.order.numItems !== undefined) {
        if (typeof params.result.order.numItems.maxValue === 'number') {
            if (params.order.acceptedOffers.length > params.result.order.numItems.maxValue) {
                throw new factory.errors.Argument(
                    'Transaction',
                    format('Number of order items must be less than or equal to %s', params.result.order.numItems.maxValue)
                );
            }
        }

        if (typeof params.result.order.numItems.minValue === 'number') {
            if (params.order.acceptedOffers.length < params.result.order.numItems.minValue) {
                throw new factory.errors.Argument(
                    'Transaction',
                    format('Number of order items must be more than equal to %s', params.result.order.numItems.minValue)
                );
            }
        }
    }
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
