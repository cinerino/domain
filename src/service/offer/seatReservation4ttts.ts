import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { MvtkRepository as MovieTicketRepo } from '../../repo/paymentMethod/movieTicket';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import {
    ICreateOperation,
    selectSeats,
    validateAcceptedOffers
} from './seatReservation';
import {
    acceptedOffers2amount,
    createAuthorizeSeatReservationActionAttributes,
    createReserveTransactionStartParams,
    responseBody2acceptedOffers4result
} from './seatReservation/factory';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

// export type IAcceptedOfferWithSeatNumber
//     = factory.chevre.event.screeningEvent.IAcceptedTicketOfferWithoutDetail &
// = factory.action.authorize.offer.seatReservation.IAcceptedOffer<factory.service.webAPI.Identifier.Chevre> &
// {
// price: number;
// priceCurrency: factory.priceCurrency;
// additionalProperty?: factory.propertyValue.IPropertyValue<string>[];
// itemOffered: {
//     serviceOutput: factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation>;
// };
// };

// export interface IAcceptedOffer {
//     seat_code?: string;
//     ticket_type: string;
//     watcher_name: string;
// }

// enum TicketTypeCategory {
//     Normal = 'Normal',
//     Wheelchair = 'Wheelchair'
// }

/**
 * 座席予約承認
 */
export function create(params: {
    project: factory.project.IProject;
    // object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre>;
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<factory.service.webAPI.Identifier.Chevre> & {
        // acceptedOffers: IAcceptedOffer[];
        // event: { id: string };
    };
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        movieTicket: MovieTicketRepo;
        project: ProjectRepo;
        seller: SellerRepo;
        transaction: TransactionRepo;
    }): Promise<factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.Chevre>> => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined
            || project.settings.chevre === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const eventService = new chevre.service.Event({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });
        const reserveService = new chevre.service.transaction.Reserve({
            endpoint: project.settings.chevre.endpoint,
            auth: chevreAuthClient
        });

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        if (params.object.event === undefined || params.object.event === null) {
            throw new factory.errors.ArgumentNull('object.event');
        }

        let event: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
        event = await eventService.findById<factory.chevre.eventType.ScreeningEvent>({ id: params.object.event.id });

        const offers = event.offers;
        if (offers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        let offeredThrough = offers.offeredThrough;
        if (offeredThrough === undefined) {
            offeredThrough = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
        }

        // 座席自動選択
        params.object.acceptedOffer = await selectSeats(
            project,
            event,
            params.object.acceptedOffer,
            params.transaction.id
        )();

        const acceptedOffers = await validateAcceptedOffers({
            project: { typeOf: params.project.typeOf, id: params.project.id },
            object: params.object,
            event: event,
            seller: transaction.seller
        })(repos);

        let requestBody: factory.action.authorize.offer.seatReservation.IRequestBody<typeof offeredThrough.identifier>;
        let responseBody: factory.chevre.transaction.ITransaction<factory.chevre.transactionType.Reserve> | undefined;
        let acceptedOffers4result: factory.action.authorize.offer.seatReservation.IResultAcceptedOffer[] | undefined;

        const startParams = createReserveTransactionStartParams({
            project: project,
            object: params.object,
            transaction: transaction
        });
        const reserveTransaction = await reserveService.start(startParams);

        // 承認アクションを開始
        const actionAttributes = createAuthorizeSeatReservationActionAttributes({
            acceptedOffers: acceptedOffers,
            event: event,
            pendingTransaction: reserveTransaction,
            transaction: transaction
        });
        const action = await repos.action.start(actionAttributes);

        try {
            requestBody = {
                id: reserveTransaction.id,
                object: params.object
            };

            responseBody = await reserveService.addReservations(requestBody);

            // const tmpReservations = createTmpReservations({
            //     acceptedOffers,
            //     reservations: (Array.isArray(responseBody.object.reservations)) ? responseBody.object.reservations : []
            // });
            // debug(tmpReservations.length, 'tmp reservation(s) created');

            // 座席仮予約からオファー情報を生成する
            acceptedOffers4result = responseBody2acceptedOffers4result({
                responseBody: responseBody,
                // tmpReservations: tmpReservations,
                event: event,
                project: params.project,
                seller: transaction.seller
            });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = (error instanceof Error) ? { ...error, ...{ message: error.message } } : error;
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            try {
                // 仮予約があれば削除
                if (responseBody !== undefined) {
                    await reserveService.cancel({ id: responseBody.id });
                }
            } catch (error) {
                // no op
                // 失敗したら仕方ない
            }

            throw error;
        }

        // 金額計算
        const amount = acceptedOffers2amount({ acceptedOffers: acceptedOffers });

        // アクションを完了
        const result: factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre> = {
            price: amount,
            priceCurrency: factory.priceCurrency.JPY,
            point: 0,
            requestBody: requestBody,
            responseBody: responseBody,
            ...(acceptedOffers4result !== undefined) ? { acceptedOffers: acceptedOffers4result } : undefined
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}
