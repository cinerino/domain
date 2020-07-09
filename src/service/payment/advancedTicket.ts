/**
 * 前売券決済承認アクションサービス
 * 基本的にsskts専用
 */
import * as createDebug from 'debug';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as PaymentMethodRepo } from '../../repo/paymentMethod';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as factory from '../../factory';

const debug = createDebug('cinerino-domain:service');

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    paymentMethod?: PaymentMethodRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * 着券済ムビチケ決済承認
 */
export function authorize(params: {
    project: factory.project.IProject;
    agentId: string;
    transactionId: string;
    authorizeObject: factory.action.authorize.paymentMethod.movieTicket.IObject4sskts;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.movieTicket.IAction[]> {
    return async (repos: {
        action: ActionRepo;
        paymentMethod?: PaymentMethodRepo;
        transaction: TransactionRepo;
    }) => {
        // 互換性維持対応tとして、デフォルト決済方法はMovieTicket
        if (typeof params.authorizeObject.typeOf !== 'string') {
            params.authorizeObject.typeOf = factory.paymentMethodType.MovieTicket;
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const event = await validate(params)(repos);

        // 着券結果からムビチケリストを作成する
        const authorizeActionObjects = seatSyncInfoIn2movieTickets({
            typeOf: params.authorizeObject.typeOf,
            event: event,
            seatSyncInfoIn: params.authorizeObject.seatInfoSyncIn
        });

        return Promise.all(authorizeActionObjects.map(async (authorizeActionObject) => {
            // 承認アクションを開始する
            const actionAttributes: factory.action.authorize.paymentMethod.movieTicket.IAttributes = {
                project: transaction.project,
                typeOf: factory.actionType.AuthorizeAction,
                object: authorizeActionObject,
                agent: transaction.agent,
                recipient: transaction.seller,
                purpose: { typeOf: transaction.typeOf, id: transaction.id }
            };
            const action = await repos.action.start(actionAttributes);

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            try {
                // 一度認証されたムビチケをDBに記録する(後で検索しやすいように)
                await savePaymentMethods(params)(repos);
            } catch (error) {
                // no op
                // 情報保管に失敗してもスルー
            }

            // アクションを完了
            const result: factory.action.authorize.paymentMethod.movieTicket.IResult = {
                accountId: authorizeActionObject.movieTickets[0].identifier,
                amount: 0,
                paymentMethod: <any>params.authorizeObject.typeOf,
                paymentStatus: factory.paymentStatusType.PaymentComplete, // すでに着券済なのでPaymentComplete
                paymentMethodId: authorizeActionObject.movieTickets[0].identifier,
                name: params.authorizeObject.typeOf,
                totalPaymentDue: {
                    typeOf: 'MonetaryAmount',
                    currency: factory.unitCode.C62,
                    value: authorizeActionObject.movieTickets.length
                },
                additionalProperty: [],
                seatInfoSyncIn: params.authorizeObject.seatInfoSyncIn
            };

            return repos.action.complete({ typeOf: factory.actionType.AuthorizeAction, id: action.id, result: result });
        }));
    };
}

function savePaymentMethods(params: {
    project: factory.project.IProject;
    authorizeObject: factory.action.authorize.paymentMethod.movieTicket.IObject4sskts;
}) {
    return async (repos: {
        paymentMethod?: PaymentMethodRepo;
    }) => {
        await Promise.all(params.authorizeObject.seatInfoSyncIn.knyknrNoInfo.map(async (knyknrNoInfo) => {
            const movieTicket: factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket = {
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: <any>params.authorizeObject.typeOf,
                identifier: knyknrNoInfo.knyknrNo,
                accessCode: knyknrNoInfo.pinCd,
                serviceType: (knyknrNoInfo.knshInfo[0] !== undefined) ? knyknrNoInfo.knshInfo[0].knshTyp : '',
                serviceOutput: {
                    reservationFor: { typeOf: factory.chevre.eventType.ScreeningEvent, id: '' },
                    reservedTicket: {
                        ticketedSeat: {
                            typeOf: factory.chevre.placeType.Seat,
                            // seatingType: 'Default',
                            seatNumber: '',
                            seatRow: '',
                            seatSection: ''
                        }
                    }
                }
            };

            if (repos.paymentMethod !== undefined) {
                await repos.paymentMethod.paymentMethodModel.findOneAndUpdate(
                    {
                        typeOf: <any>params.authorizeObject.typeOf,
                        identifier: movieTicket.identifier
                    },
                    movieTicket,
                    { upsert: true }
                )
                    .exec();
            }
        }));
    };
}

function seatSyncInfoIn2movieTickets(params: {
    typeOf: factory.paymentMethodType.MovieTicket | factory.paymentMethodType.MGTicket;
    event: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    seatSyncInfoIn: factory.action.authorize.paymentMethod.movieTicket.ISeatInfoSyncIn;
}): factory.action.authorize.paymentMethod.movieTicket.IObject[] {
    const authorizeActionObjects: factory.action.authorize.paymentMethod.movieTicket.IObject[] = [];

    const seatNumbers = params.seatSyncInfoIn.zskInfo.reduce<string[]>(
        (a, b) => {
            return [...a, b.zskCd];
        },
        []
    );

    let i = 0;
    params.seatSyncInfoIn.knyknrNoInfo.forEach((knyknrNoInfo) => {
        if (knyknrNoInfo !== undefined) {
            const movieTickets: factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket[] = [];
            knyknrNoInfo.knshInfo.forEach((knshInfo) => {
                // tslint:disable-next-line:prefer-array-literal
                [...Array(Number(knshInfo.miNum))].forEach(() => {
                    i += 1;
                    const seatNumber = seatNumbers[i - 1];
                    if (typeof seatNumber !== 'string') {
                        throw new factory.errors.Argument('seatInfoSyncIn', 'number of seat numbers not matched');
                    }

                    movieTickets.push({
                        project: { typeOf: factory.organizationType.Project, id: params.event.project.id },
                        typeOf: <any>params.typeOf,
                        serviceType: knshInfo.knshTyp,
                        identifier: knyknrNoInfo.knyknrNo,
                        accessCode: knyknrNoInfo.pinCd,
                        serviceOutput: {
                            reservationFor: {
                                typeOf: params.event.typeOf,
                                id: params.event.id
                            },
                            reservedTicket: {
                                ticketedSeat: {
                                    typeOf: factory.chevre.placeType.Seat,
                                    // seatingType: 'Default' // 情報空でよし
                                    seatNumber: seatNumber,
                                    seatRow: '', // 情報空でよし
                                    seatSection: '' // 情報空でよし
                                }
                            }
                        }
                    });
                });
            });

            authorizeActionObjects.push({
                accountId: knyknrNoInfo.knyknrNo,
                additionalProperty: [],
                amount: 0,
                movieTickets: movieTickets,
                paymentMethodId: knyknrNoInfo.knyknrNo,
                typeOf: <any>params.typeOf
            });
        }
    });

    return authorizeActionObjects;
}

function validate(params: {
    transactionId: string;
    authorizeObject: factory.action.authorize.paymentMethod.movieTicket.IObject4sskts;
}) {
    return async (repos: {
        action: ActionRepo;
    }): Promise<factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>> => {
        // 座席予約承認の存在確認
        const seatReservationAuthorizeActions = await repos.action.actionModel.find({
            typeOf: factory.actionType.AuthorizeAction,
            'purpose.id': {
                $exists: true,
                $eq: params.transactionId
            },
            'object.typeOf': factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation
        })
            .exec()
            .then((docs) => docs
                .map((doc) => <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.COA>>doc.toObject())
                .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus));
        if (seatReservationAuthorizeActions.length === 0) {
            throw new factory.errors.Argument('transactionId', '座席予約が見つかりません。');
        }
        // 座席予約承認はひとつしかない仕様
        if (seatReservationAuthorizeActions.length > 1) {
            throw new factory.errors.Argument('transactionId', '座席予約が複数見つかりました。');
        }

        return compareSeatReservationsAuthorizationAndMvtkAuthorization({
            authorizeObject: params.authorizeObject,
            seatReservationAuthorizeAction: seatReservationAuthorizeActions[0]
        });
    };
}

/**
 * 座席予約承認とムビチケ承認を比較する
 */
function compareSeatReservationsAuthorizationAndMvtkAuthorization(params: {
    authorizeObject: factory.action.authorize.paymentMethod.movieTicket.IObject4sskts;
    seatReservationAuthorizeAction: factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.COA>;
}): factory.event.IEvent<factory.chevre.eventType.ScreeningEvent> {
    const seatReservationAuthorizeAction = params.seatReservationAuthorizeAction;
    const seatReservationAuthorizeActionObject = seatReservationAuthorizeAction.object;
    const seatReservationAuthorizeActionResult
        = <factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.COA>>
        seatReservationAuthorizeAction.result;

    // 購入管理番号が一致しているか
    interface IKnyknrNoNumsByNo { [knyknrNo: string]: number; }
    const knyknrNoNumsByNoShouldBe: IKnyknrNoNumsByNo = seatReservationAuthorizeActionObject.acceptedOffer.reduce(
        (a: IKnyknrNoNumsByNo, b) => {
            const knyknrNo = b.ticketInfo.mvtkNum;
            // 券種情報にムビチケ購入管理番号があれば、枚数を追加
            if (typeof knyknrNo === 'string' && knyknrNo !== '') {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (a[knyknrNo] === undefined) {
                    a[knyknrNo] = 0;
                }
                a[knyknrNo] += 1;
            }

            return a;
        },
        {}
    );
    const knyknrNoNumsByNo: IKnyknrNoNumsByNo = params.authorizeObject.seatInfoSyncIn.knyknrNoInfo.reduce(
        (a: IKnyknrNoNumsByNo, b) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (a[b.knyknrNo] === undefined) {
                a[b.knyknrNo] = 0;
            }
            const knyknrNoNum = b.knshInfo.reduce((a2, b2) => a2 + b2.miNum, 0);
            a[b.knyknrNo] += knyknrNoNum;

            return a;
        },
        {}
    );
    debug('knyknrNoNumsByNo:', knyknrNoNumsByNo);
    debug('knyyknrNoNumsByNoShouldBe:', knyknrNoNumsByNoShouldBe);
    const knyknrNoExistsInSeatReservation =
        Object.keys(knyknrNoNumsByNo)
            .every((knyknrNo) => knyknrNoNumsByNo[knyknrNo] === knyknrNoNumsByNoShouldBe[knyknrNo]);
    const knyknrNoExistsMvtkResult =
        Object.keys(knyknrNoNumsByNoShouldBe)
            .every((knyknrNo) => knyknrNoNumsByNo[knyknrNo] === knyknrNoNumsByNoShouldBe[knyknrNo]);
    if (!knyknrNoExistsInSeatReservation || !knyknrNoExistsMvtkResult) {
        throw new factory.errors.Argument('authorizeActionResult', 'knyknrNoInfo not matched with seat reservation authorizeAction');
    }

    const updTmpReserveSeatArgs = seatReservationAuthorizeActionResult.requestBody;
    const updTmpReserveSeatResult = seatReservationAuthorizeActionResult.responseBody;
    if (updTmpReserveSeatArgs === undefined || updTmpReserveSeatResult === undefined) {
        throw new factory.errors.NotFound('seatReservationAuthorizeActionResult');
    }

    // サイトコードが一致しているか (COAの劇場コードから頭の0をとった値)
    // tslint:disable-next-line:no-magic-numbers
    const stCdShouldBe = parseInt(updTmpReserveSeatArgs.theaterCode.slice(-2), 10)
        .toString();
    if (params.authorizeObject.seatInfoSyncIn.stCd !== stCdShouldBe) {
        throw new factory.errors.Argument('authorizeActionResult', 'stCd not matched with seat reservation authorizeAction');
    }

    // 作品コードが一致しているか
    // ムビチケに渡す作品枝番号は、COAの枝番号を0埋めで二桁に揃えたもの、というのが、ムビチケ側の仕様なので、そのようにバリデーションをかけます。
    // tslint:disable-next-line:no-magic-numbers
    const titleBranchNum4mvtk = `0${updTmpReserveSeatArgs.titleBranchNum}`.slice(-2);
    const skhnCdShouldBe = `${updTmpReserveSeatArgs.titleCode}${titleBranchNum4mvtk}`;
    if (params.authorizeObject.seatInfoSyncIn.skhnCd !== skhnCdShouldBe) {
        throw new factory.errors.Argument('authorizeActionResult', 'skhnCd not matched with seat reservation authorizeAction');
    }

    // スクリーンコードが一致しているか
    if (params.authorizeObject.seatInfoSyncIn.screnCd !== updTmpReserveSeatArgs.screenCode) {
        throw new factory.errors.Argument('authorizeActionResult', 'screnCd not matched with seat reservation authorizeAction');
    }

    // 座席番号が一致しているか
    const seatNumsInSeatReservationAuthorization = updTmpReserveSeatResult.listTmpReserve.map((tmpReserve) => tmpReserve.seatNum);
    if (!params.authorizeObject.seatInfoSyncIn.zskInfo.every(
        (zskInfo) => seatNumsInSeatReservationAuthorization.indexOf(zskInfo.zskCd) >= 0
    )) {
        throw new factory.errors.Argument('authorizeActionResult', 'zskInfo not matched with seat reservation authorizeAction');
    }

    return seatReservationAuthorizeActionObject.event;
}

export function voidTransaction(params: {
    agentId: string;
    transactionId: string;
    actionId: string;
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transactionId
        });

        if (transaction.agent.id !== params.agentId) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        const action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.actionId });

        // 特に何もしない
    };
}
