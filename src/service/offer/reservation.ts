import { INTERNAL_SERVER_ERROR } from 'http-status';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as COA from '../../coa';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as ProjectRepo } from '../../repo/project';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

export import WebAPIIdentifier = factory.service.webAPI.Identifier;
export type IAuthorizeSeatReservationResponse<T extends WebAPIIdentifier> =
    factory.action.authorize.offer.seatReservation.IResponseBody<T>;

/**
 * 座席仮予約取消
 */
export function voidTransaction(params: factory.task.IData<factory.taskName.CancelSeatReservation>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        // 座席仮予約アクション検索
        const authorizeActions = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier>[]>
            await repos.action.searchByPurpose({
                typeOf: factory.actionType.AuthorizeAction,
                purpose: {
                    typeOf: params.purpose.typeOf,
                    id: params.purpose.id
                }
            })
                .then((actions) => actions
                    .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
                );

        await Promise.all(authorizeActions.map(async (action) => {
            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });

            if (action.instrument === undefined) {
                action.instrument = {
                    typeOf: 'WebAPI',
                    identifier: WebAPIIdentifier.Chevre
                };
            }

            switch (action.instrument.identifier) {
                case WebAPIIdentifier.COA:
                    await processVoidTransaction4coa({
                        action: <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>>action
                    });

                    break;

                default:
                    await processVoidTransaction4chevre({
                        action: <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.Chevre>>action,
                        project: project
                    });
            }
        }));
    };
}

async function processVoidTransaction4coa(params: {
    action: factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>;
}) {
    const action = params.action;

    // COAの場合、resultに連携内容情報が記録されているので、その情報を元に仮予約を取り消す
    if (action.result !== undefined) {
        const updTmpReserveSeatArgs = action.result.requestBody;
        const updTmpReserveSeatResult = action.result.responseBody;

        if (updTmpReserveSeatArgs !== undefined && updTmpReserveSeatResult !== undefined) {
            // COAで仮予約取消
            try {
                const reserveService = new COA.service.Reserve(
                    {
                        endpoint: credentials.coa.endpoint,
                        auth: coaAuthClient
                    },
                    { timeout: COA_TIMEOUT }
                );

                await reserveService.delTmpReserve({
                    theaterCode: updTmpReserveSeatArgs.theaterCode,
                    dateJouei: updTmpReserveSeatArgs.dateJouei,
                    titleCode: updTmpReserveSeatArgs.titleCode,
                    titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                    timeBegin: updTmpReserveSeatArgs.timeBegin,
                    tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum
                });
            } catch (error) {
                let deleted = false;
                // COAサービスエラーの場合ハンドリング
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if */
                if (error.name === 'COAServiceError') {
                    if (Number.isInteger(error.code) && error.code < INTERNAL_SERVER_ERROR) {
                        // すでに取消済の場合こうなるので、okとする
                        if (error.message === '座席取消失敗') {
                            deleted = true;
                        }
                        // if (action.actionStatus === factory.actionStatusType.CanceledActionStatus) {
                        //     deleted = true;
                        // }
                    }
                }

                if (!deleted) {
                    throw error;
                }
            }
        }
    }
}

async function processVoidTransaction4chevre(params: {
    action: factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.Chevre>;
    project: factory.project.IProject;
}) {
    // Chevreの場合、objectの進行中取引情報を元に、予約取引を取り消す
    const reserveService = new chevre.service.transaction.Reserve({
        endpoint: credentials.chevre.endpoint,
        auth: chevreAuthClient
    });

    if (typeof params.action.object.pendingTransaction?.transactionNumber === 'string') {
        // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
        await reserveService.cancel({ transactionNumber: params.action.object.pendingTransaction.transactionNumber });
    }
}
