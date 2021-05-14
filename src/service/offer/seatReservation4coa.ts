import * as createDebug from 'debug';
import * as moment from 'moment';

import { credentials } from '../../credentials';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handleCOAReserveTemporarilyError } from '../../errorHandler';

import {
    createAcceptedOffersWithoutDetails,
    createAuthorizeSeatReservationActionAttributes,
    createUpdTmpReserveSeatArgs,
    IAcceptedOfferWithoutDetail,
    offers2resultPrice,
    responseBody2acceptedOffers4result,
    validateOffers
} from './seatReservation4coa/factory';

import * as chevre from '../../chevre';
import * as COA from '../../coa';
import { factory } from '../../factory';

const debug = createDebug('cinerino-domain:service');

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

// const chevreAuthClient = new chevre.auth.ClientCredentials({
//     domain: credentials.chevre.authorizeServerDomain,
//     clientId: credentials.chevre.clientId,
//     clientSecret: credentials.chevre.clientSecret,
//     scopes: [],
//     state: ''
// });

export import WebAPIIdentifier = factory.service.webAPI.Identifier;

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    event: chevre.service.Event;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * COA座席予約承認
 */
export function create(params: {
    project: factory.project.IProject;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        event: chevre.service.Event;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // イベントを取得
        // const eventService = new chevre.service.Event({
        //     endpoint: credentials.chevre.endpoint,
        //     auth: chevreAuthClient,
        //     project: { id: params.project.id }
        // });
        const screeningEvent = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
            id: params.object.event.id
        });

        // 必ず定義されている前提
        const coaInfo = <factory.event.screeningEvent.ICOAInfo>screeningEvent.coaInfo;

        const acceptedOffersWithoutDetails = await createAcceptedOffersWithoutDetails({
            object: params.object,
            coaInfo: coaInfo
        });

        const acceptedOffer = await validateOffers(
            params.project,
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            acceptedOffersWithoutDetails
        );

        // 承認アクションを開始
        const actionAttributes = createAuthorizeSeatReservationActionAttributes({
            acceptedOffers: acceptedOffer,
            event: screeningEvent,
            transaction: transaction
        });
        const action = await repos.action.start(actionAttributes);

        // COA仮予約
        const updTmpReserveSeatArgs = createUpdTmpReserveSeatArgs({ object: params.object, coaInfo: coaInfo });
        let updTmpReserveSeatResult: COA.factory.reserve.IUpdTmpReserveSeatResult;
        try {
            debug('updTmpReserveSeat processing...', updTmpReserveSeatArgs);
            const reserveService = new COA.service.Reserve(
                {
                    endpoint: credentials.coa.endpoint,
                    auth: coaAuthClient
                },
                { timeout: COA_TIMEOUT }
            );
            updTmpReserveSeatResult = await reserveService.updTmpReserveSeat(updTmpReserveSeatArgs);
            debug('updTmpReserveSeat processed', updTmpReserveSeatResult);
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw handleCOAReserveTemporarilyError(error);
        }

        // 座席仮予約からオファー情報を生成する
        const acceptedOffers4result = responseBody2acceptedOffers4result({
            responseBody: updTmpReserveSeatResult,
            object: action.object,
            event: screeningEvent,
            seller: transaction.seller,
            bookingTime: moment(action.startDate)
                .toDate()
        });
        const { price, requiredPoint } = offers2resultPrice(acceptedOffer);
        const result: factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA> = {
            price: price,
            priceCurrency: factory.priceCurrency.JPY,
            amount: (requiredPoint > 0)
                ? [{
                    typeOf: 'MonetaryAmount',
                    currency: 'Point',
                    value: requiredPoint
                }]
                : [],
            requestBody: updTmpReserveSeatArgs,
            responseBody: updTmpReserveSeatResult,
            acceptedOffers: acceptedOffers4result,
            ...{ updTmpReserveSeatArgs, updTmpReserveSeatResult } // 互換性維持のため
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * COA座席予約承認取消
 */
export function cancel(params: {
    /**
     * 承認アクションID
     */
    id: string;
    /**
     * 取引進行者
     */
    agent: { id: string };
    /**
     * 取引
     */
    transaction: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        // MongoDBでcompleteステータスであるにも関わらず、COAでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>action.result;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (actionResult.requestBody !== undefined && actionResult.responseBody !== undefined) {
            // 座席仮予約削除
            const reserveService = new COA.service.Reserve(
                {
                    endpoint: credentials.coa.endpoint,
                    auth: coaAuthClient
                },
                { timeout: COA_TIMEOUT }
            );

            debug('delTmpReserve processing...', action);
            await reserveService.delTmpReserve({
                theaterCode: actionResult.requestBody.theaterCode,
                dateJouei: actionResult.requestBody.dateJouei,
                titleCode: actionResult.requestBody.titleCode,
                titleBranchNum: actionResult.requestBody.titleBranchNum,
                timeBegin: actionResult.requestBody.timeBegin,
                tmpReserveNum: actionResult.responseBody.tmpReserveNum
            });
            debug('delTmpReserve processed');
        }
    };
}

/**
 * 座席予約承認アクションの供給情報を変更する
 */
export function changeOffers(params: {
    project: factory.project.IProject;
    id: string;
    agent: { id: string };
    transaction: { id: string };
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        event: chevre.service.Event;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        const action = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>>
            await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        validate4changeOffer({ action, object: params.object });
        const authorizeAction = action;

        // イベントを取得
        // const eventService = new chevre.service.Event({
        //     endpoint: credentials.chevre.endpoint,
        //     auth: chevreAuthClient,
        //     project: { id: params.project.id }
        // });
        const screeningEvent = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
            id: params.object.event.id
        });

        // 供給情報の有効性を確認
        const acceptedOffersWithoutDetails: IAcceptedOfferWithoutDetail[] = params.object.acceptedOffer.map((offer) => {
            const originalOffer = authorizeAction.object.acceptedOffer.find((o) => {
                return o.seatSection === offer.seatSection && o.seatNumber === offer.seatNumber;
            });

            if (originalOffer === undefined) {
                throw new factory.errors.Argument('offers', 'seatSection or seatNumber not matched.');
            }

            return {
                ...offer,
                ticketInfo: {
                    ...offer.ticketInfo,
                    spseatAdd1: originalOffer.ticketInfo.spseatAdd1,
                    spseatAdd2: originalOffer.ticketInfo.spseatAdd2,
                    spseatKbn: originalOffer.ticketInfo.spseatKbn
                }
            };
        });
        const acceptedOffer = await validateOffers(
            params.project,
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            acceptedOffersWithoutDetails
        );

        // 供給情報と価格を変更してからDB更新
        authorizeAction.object.acceptedOffer = acceptedOffer;
        (<any>authorizeAction.object).offers = acceptedOffer; // 互換性維持のため

        const updTmpReserveSeatResult = authorizeAction.result?.responseBody;
        if (updTmpReserveSeatResult === undefined) {
            throw new factory.errors.NotFound('action.result.responseBody');
        }

        const acceptedOffers4result = responseBody2acceptedOffers4result({
            responseBody: updTmpReserveSeatResult,
            object: authorizeAction.object,
            event: screeningEvent,
            seller: transaction.seller,
            bookingTime: moment(authorizeAction.startDate)
                .toDate()
        });
        const { price, requiredPoint } = offers2resultPrice(acceptedOffer);

        const actionResult: factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA> = {
            ...<factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>authorizeAction.result,
            price: price,
            amount: (requiredPoint > 0)
                ? [{
                    typeOf: 'MonetaryAmount',
                    currency: 'Point',
                    value: requiredPoint
                }]
                : [],
            acceptedOffers: acceptedOffers4result
        };

        // 座席予約承認アクションの供給情報を変更する
        return repos.action.actionModel.findOneAndUpdate(
            {
                typeOf: factory.actionType.AuthorizeAction,
                _id: params.id,
                actionStatus: factory.actionStatusType.CompletedActionStatus // 完了ステータスのアクションのみ
            },
            {
                object: authorizeAction.object,
                result: actionResult
            },
            { new: true }
        )
            .exec()
            .then((doc) => {
                if (doc === null) {
                    throw new factory.errors.NotFound('authorizeAction');
                }

                return doc.toObject();
            });
    };
}

function validate4changeOffer(params: {
    action: factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
}) {
    // アクション中のイベント識別子と座席リストが合っているかどうか確認
    const authorizeAction = params.action;
    // 完了ステータスのアクションのみ更新可能
    if (authorizeAction.actionStatus !== factory.actionStatusType.CompletedActionStatus) {
        throw new factory.errors.NotFound('authorizeAction');
    }

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (authorizeAction.object.event === undefined) {
        throw new factory.errors.NotFound('authorizeAction.object.event');
    }

    // イベントが一致しているかどうか
    if (authorizeAction.object.event.id !== params.object.event.id) {
        throw new factory.errors.Argument('Event', 'Event ID not matched.');
    }

    // 座席セクションと座席番号が一致しているかどうか
    const acceptedOfferParams = (Array.isArray(params.object.acceptedOffer)) ? params.object.acceptedOffer : [];
    const allSeatsExisted = authorizeAction.object.acceptedOffer.every((originalAcceptedOffer) => {
        return acceptedOfferParams.some(
            (o) => originalAcceptedOffer.seatSection === o.seatSection && originalAcceptedOffer.seatNumber === o.seatNumber
        );
    });
    const allSeatsMatched = (acceptedOfferParams.length === authorizeAction.object.acceptedOffer.length) && allSeatsExisted;
    if (!allSeatsMatched) {
        throw new factory.errors.Argument('offers', 'seatSection or seatNumber not matched.');
    }
}
