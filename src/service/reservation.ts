/**
 * 予約サービス
 * 予約の保管先はChevre | COAです
 */
import * as moment from 'moment';

import { credentials } from '../credentials';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';

import { handleChevreError } from '../errorHandler';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../repo/project';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

type IReservation = factory.chevre.reservation.IReservation<factory.chevre.reservationType.EventReservation>;

type IOwnershipInfoWithDetail =
    factory.ownershipInfo.IOwnershipInfo<factory.ownershipInfo.IGoodWithDetail<factory.chevre.reservationType.EventReservation>>;

export type ISearchEventReservationsOperation<T> = (repos: {
    ownershipInfo: OwnershipInfoRepo;
    project: ProjectRepo;
}) => Promise<T>;

/**
 * 予約取消
 */
// tslint:disable-next-line:max-func-body-length
export function cancelReservation(params: factory.task.IData<factory.taskName.CancelReservation>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const projectId: string = params.project.id;
        const project = await repos.project.findById({ id: projectId });

        const action = await repos.action.start(params);

        try {
            let cancelReservationObject = params.object;

            if (params.instrument === undefined) {
                params.instrument = {
                    typeOf: 'WebAPI',
                    identifier: factory.service.webAPI.Identifier.Chevre
                };
            }

            switch (params.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    cancelReservationObject = <COA.factory.reserve.IStateReserveArgs>cancelReservationObject;

                    const reserveService = new COA.service.Reserve({
                        endpoint: credentials.coa.endpoint,
                        auth: coaAuthClient
                    });
                    const stateReserveResult = await reserveService.stateReserve(cancelReservationObject);

                    if (stateReserveResult !== null) {
                        await reserveService.delReserve({
                            theaterCode: cancelReservationObject.theaterCode,
                            reserveNum: cancelReservationObject.reserveNum,
                            telNum: cancelReservationObject.telNum,
                            dateJouei: stateReserveResult.dateJouei,
                            titleCode: stateReserveResult.titleCode,
                            titleBranchNum: stateReserveResult.titleBranchNum,
                            timeBegin: stateReserveResult.timeBegin,
                            listSeat: stateReserveResult.listTicket
                        });
                    }

                    break;

                default:
                    // cancelReservationObject = cancelReservationObject;

                    if (project.settings === undefined) {
                        throw new factory.errors.ServiceUnavailable('Project settings undefined');
                    }
                    if (project.settings.chevre === undefined) {
                        throw new factory.errors.ServiceUnavailable('Project settings not found');
                    }

                    const cancelReservationService = new chevre.service.transaction.CancelReservation({
                        endpoint: project.settings.chevre.endpoint,
                        auth: chevreAuthClient
                    });

                    if (cancelReservationService !== undefined) {
                        const cancelReservationTransaction = await cancelReservationService.start({
                            project: { typeOf: project.typeOf, id: project.id },
                            typeOf: factory.chevre.transactionType.CancelReservation,
                            agent: {
                                typeOf: params.agent.typeOf,
                                id: params.agent.id,
                                name: String(params.agent.name)
                            },
                            object: {
                                transaction: {
                                    typeOf: (<any>cancelReservationObject).typeOf,
                                    id: (<any>cancelReservationObject).id
                                }
                            },
                            expires: moment()
                                // tslint:disable-next-line:no-magic-numbers
                                .add(5, 'minutes')
                                .toDate()
                        });

                        await cancelReservationService.confirm({
                            id: cancelReservationTransaction.id,
                            potentialActions: params.potentialActions
                        });
                    }
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: {} });
    };
}

/**
 * 予約を確定する
 */
export function confirmReservation(params: factory.action.interact.confirm.reservation.IAttributes<factory.service.webAPI.Identifier>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        let reserveService: COA.service.Reserve | chevre.service.transaction.Reserve;

        // アクション開始
        const confirmActionAttributes = params;
        const action = await repos.action.start(confirmActionAttributes);

        try {
            let object = confirmActionAttributes.object;
            if (params.instrument === undefined) {
                params.instrument = { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre };
            }
            switch (params.instrument.identifier) {
                case factory.service.webAPI.Identifier.COA:
                    // COA本予約
                    // 未本予約であれば実行(COA本予約は一度成功すると成功できない)
                    object = <factory.action.interact.confirm.reservation.IObject4COA>object;

                    // リトライ可能な前提でつくる必要があるので、要注意
                    // すでに本予約済みかどうか確認
                    reserveService = new COA.service.Reserve({
                        endpoint: credentials.coa.endpoint,
                        auth: coaAuthClient
                    });
                    const stateReserveResult = await reserveService.stateReserve({
                        theaterCode: object.theaterCode,
                        reserveNum: object.tmpReserveNum,
                        telNum: object.telNum
                    });

                    if (stateReserveResult === null) {
                        await reserveService.updReserve(object);
                    }

                    break;

                default:
                    // 座席予約確定
                    if (project.settings === undefined) {
                        throw new factory.errors.ServiceUnavailable('Project settings undefined');
                    }
                    if (project.settings.chevre === undefined) {
                        throw new factory.errors.ServiceUnavailable('Project settings not found');
                    }

                    reserveService = new chevre.service.transaction.Reserve({
                        endpoint: project.settings.chevre.endpoint,
                        auth: chevreAuthClient
                    });

                    object = <factory.action.interact.confirm.reservation.IObject4Chevre>object;
                    await reserveService.confirm(object);
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: confirmActionAttributes.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const result: factory.action.interact.confirm.reservation.IResult = {
        };
        await repos.action.complete({ typeOf: confirmActionAttributes.typeOf, id: action.id, result: result });
    };
}

/**
 * イベント予約検索
 */
export function searchScreeningEventReservations(
    params: factory.ownershipInfo.ISearchConditions<factory.chevre.reservationType.EventReservation> & {
        project: factory.project.IProject;
    }
): ISearchEventReservationsOperation<IOwnershipInfoWithDetail[]> {
    return async (repos: {
        ownershipInfo: OwnershipInfoRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        let ownershipInfosWithDetail: IOwnershipInfoWithDetail[] = [];
        try {
            // 所有権検索
            const ownershipInfos = await repos.ownershipInfo.search(params);

            // Chevre予約の場合、詳細を取得
            const reservationIds = ownershipInfos
                .filter((o) => {
                    return o.typeOfGood.bookingService === undefined
                        || o.typeOfGood.bookingService.identifier === factory.service.webAPI.Identifier.Chevre;
                })
                .map((o) => <string>o.typeOfGood.id);

            let chevreReservations: IReservation[] = [];
            if (reservationIds.length > 0) {
                if (project.settings.chevre === undefined) {
                    throw new factory.errors.ServiceUnavailable('Project settings not found');
                }

                const reservationService = new chevre.service.Reservation({
                    endpoint: project.settings.chevre.endpoint,
                    auth: chevreAuthClient
                });

                const searchReservationsResult = await reservationService.search<factory.chevre.reservationType.EventReservation>({
                    project: { ids: [project.id] },
                    typeOf: factory.chevre.reservationType.EventReservation,
                    ids: reservationIds
                });
                chevreReservations = searchReservationsResult.data;
            }

            ownershipInfosWithDetail = ownershipInfos.map((o) => {
                let reservation = chevreReservations.find((r) => r.id === o.typeOfGood.id);
                if (reservation === undefined) {
                    // COA予約の場合、typeOfGoodに詳細も含まれる
                    reservation = <IReservation>o.typeOfGood;
                    // throw new factory.errors.NotFound('Reservation');
                }

                return { ...o, typeOfGood: reservation };
            });
        } catch (error) {
            error = handleChevreError(error);
            throw error;
        }

        return ownershipInfosWithDetail;
    };
}
