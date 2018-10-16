/**
 * ムビチケ決済サービス
 */
import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import * as factory from '../../factory';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MongoRepository as OrganizationRepo } from '../../repo/organization';

const debug = createDebug('cinerino-domain:service');
export type ICheckMovieTicketOperation<T> = (repos: {
    action: ActionRepo;
    event: EventRepo;
    organization: OrganizationRepo;
    movieTicketAuthService: mvtkapi.service.Auth;
}) => Promise<T>;
/**
 * ムビチケ
 */
export function checkMovieTicket(
    params: factory.action.check.paymentMethod.movieTicket.IAttributes
): ICheckMovieTicketOperation<factory.action.check.paymentMethod.movieTicket.IAction> {
    return async (repos: {
        action: ActionRepo;
        event: EventRepo;
        organization: OrganizationRepo;
        movieTicketAuthService: mvtkapi.service.Auth;
    }) => {
        const actionAttributes: factory.action.check.paymentMethod.movieTicket.IAttributes = {
            typeOf: factory.actionType.CheckAction,
            agent: params.agent,
            object: params.object
        };
        let action = await repos.action.start(actionAttributes);

        let purchaseNumberAuthIn: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthIn;
        let purchaseNumberAuthResult: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthResult;
        try {
            if (params.object.event.typeOf !== factory.chevre.eventType.ScreeningEvent) {
                throw new factory.errors.Argument('object.event.typeOf', `${params.object.event.typeOf} not acceptable`);
            }
            // イベント情報取得
            const screeningEvent = await repos.event.findById({ typeOf: params.object.event.typeOf, id: params.object.event.id });

            // ショップ情報取得
            const movieTheater = await repos.organization.findById({
                typeOf: params.object.seller.typeOf,
                id: params.object.seller.id
            });
            if (movieTheater.paymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }
            const movieTicketPaymentAccepted = <factory.organization.IPaymentAccepted<factory.paymentMethodType.MovieTicket>>
                movieTheater.paymentAccepted.find((a) => a.paymentMethodType === factory.paymentMethodType.MovieTicket);
            if (movieTicketPaymentAccepted === undefined) {
                throw new factory.errors.Argument('transactionId', 'Movie Ticket payment not accepted');
            }

            purchaseNumberAuthIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                jhshbtsCd: mvtkapi.mvtk.services.auth.purchaseNumberAuth.InformationTypeCode.All,
                knyknrNoInfoIn: params.object.knyknrNoInfo,
                skhnCd: screeningEvent.superEvent.workPerformed.identifier,
                stCd: movieTicketPaymentAccepted.movieTicketInfo.stCd,
                jeiYmd: moment(screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD')
            };
            purchaseNumberAuthResult = await repos.movieTicketAuthService.purchaseNumberAuth(purchaseNumberAuthIn);
            debug('purchaseNumberAuthResult:', purchaseNumberAuthResult);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: actionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        const result: factory.action.check.paymentMethod.movieTicket.IResult = {
            purchaseNumberAuthIn: purchaseNumberAuthIn,
            purchaseNumberAuthResult: purchaseNumberAuthResult
        };
        action = await repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });

        return action;
    };
}
