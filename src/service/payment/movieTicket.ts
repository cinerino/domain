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
        const action = await repos.action.start(actionAttributes);

        let purchaseNumberAuthIn: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthIn;
        let purchaseNumberAuthResult: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthResult;
        try {
            const eventIds = Array.from(new Set(params.object.movieTickets.map((ticket) => ticket.serviceOutput.reservationFor.id)));
            if (eventIds.length !== 1) {
                throw new factory.errors.Argument('movieTickets', 'Number of events must be 1');
            }
            const eventId = eventIds[0];

            // イベント情報取得
            const screeningEvent = await repos.event.findById({ typeOf: factory.chevre.eventType.ScreeningEvent, id: eventId });

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

            const movieTicketIdentifiers: string[] = [];
            const knyknrNoInfoIn: mvtkapi.mvtk.services.auth.purchaseNumberAuth.IKnyknrNoInfoIn[] = [];
            params.object.movieTickets.forEach((movieTicket) => {
                if (movieTicketIdentifiers.indexOf(movieTicket.identifier) < 0) {
                    movieTicketIdentifiers.push(movieTicket.identifier);
                    knyknrNoInfoIn.push({
                        knyknrNo: movieTicket.identifier,
                        pinCd: movieTicket.accessCode
                    });
                }
            });
            purchaseNumberAuthIn = {
                kgygishCd: movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
                jhshbtsCd: mvtkapi.mvtk.services.auth.purchaseNumberAuth.InformationTypeCode.All,
                knyknrNoInfoIn: knyknrNoInfoIn,
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

        return repos.action.complete({ typeOf: actionAttributes.typeOf, id: action.id, result: result });
    };
}
