import { INTERNAL_SERVER_ERROR } from 'http-status';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as COA from '../../coa';
import { factory } from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';

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
export function voidTransaction(params: factory.task.IData<factory.taskName.VoidReserveTransaction>) {
    return async (repos: {
        action: ActionRepo;
        assetTransaction: chevre.service.AssetTransaction;
    }) => {
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
                        project: params.project
                    })(repos);
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

function processVoidTransaction4chevre(params: {
    action: factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.Chevre>;
    project: { id: string };
}) {
    return async (repos: {
        assetTransaction: chevre.service.AssetTransaction;
    }) => {
        const transactionNumber = params.action.object.pendingTransaction?.transactionNumber;
        if (typeof transactionNumber === 'string') {
            // 取引が存在すれば中止
            const { data } = await repos.assetTransaction.search({
                limit: 1,
                project: { ids: [params.project.id] },
                typeOf: chevre.factory.assetTransactionType.Reserve,
                transactionNumber: { $eq: transactionNumber }
            });
            if (data.length > 0) {
                // Chevreの場合、objectの進行中取引情報を元に、予約取引を取り消す
                const reserveService = new chevre.service.assetTransaction.Reserve({
                    endpoint: credentials.chevre.endpoint,
                    auth: chevreAuthClient,
                    project: { id: params.project.id }
                });

                await reserveService.cancel({ transactionNumber: transactionNumber });
            }
        }
    };
}
