import * as COA from '@motionpicture/coa-service';
import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as EventRepo } from '../../../../../../repo/event';
import { InMemoryRepository as OfferRepo } from '../../../../../../repo/offer';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

import * as factory from '../../../../../../factory';

const debug = createDebug('cinerino-domain:service');

export import WebAPIIdentifier = factory.service.webAPI.Identifier;

export type ICreateOperation<T> = (repos: {
    event: EventRepo;
    action: ActionRepo;
    offer?: OfferRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IActionAndTransactionOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * ムビチケ券種インターフェース
 */
export type ICOAMvtkTicket = COA.services.master.IMvtkTicketcodeResult & {
    stdPrice: number;
    salePrice: number;
    addGlasses: number;
};

/**
 * 座席予約に対する承認アクションを開始する前の処理
 * 供給情報の有効性の確認などを行う。
 * この処理次第で、どのような供給情報を受け入れられるかが決定するので、とても大事な処理です。
 * バグ、不足等あれば、随時更新することが望ましい。
 */
// tslint:disable-next-line:max-func-body-length
async function validateOffers(
    isMember: boolean,
    screeningEvent: factory.event.screeningEvent.IEvent,
    offers: factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail<WebAPIIdentifier.COA>[],
    coaTickets?: COA.services.master.ITicketResult[]
): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]> {
    // 詳細情報ありの供給情報リストを初期化
    // 要求された各供給情報について、バリデーションをかけながら、このリストに追加していく
    const offersWithDetails: factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[] = [];

    // 供給情報が適切かどうか確認
    const availableSalesTickets: COA.services.reserve.ISalesTicketResult[] = [];

    // 必ず定義されている前提
    const coaInfo = <factory.event.screeningEvent.ICOAInfo>screeningEvent.coaInfo;

    // COA券種取得(非会員)
    const salesTickets4nonMember = await COA.services.reserve.salesTicket({
        theaterCode: coaInfo.theaterCode,
        dateJouei: coaInfo.dateJouei,
        titleCode: coaInfo.titleCode,
        titleBranchNum: coaInfo.titleBranchNum,
        timeBegin: coaInfo.timeBegin,
        flgMember: COA.services.reserve.FlgMember.NonMember
    });
    availableSalesTickets.push(...salesTickets4nonMember);

    // COA券種取得(会員)
    if (isMember) {
        const salesTickets4member = await COA.services.reserve.salesTicket({
            theaterCode: coaInfo.theaterCode,
            dateJouei: coaInfo.dateJouei,
            titleCode: coaInfo.titleCode,
            titleBranchNum: coaInfo.titleBranchNum,
            timeBegin: coaInfo.timeBegin,
            flgMember: COA.services.reserve.FlgMember.Member
        });
        availableSalesTickets.push(...salesTickets4member);
    }
    debug('availableSalesTickets:', availableSalesTickets);

    // 利用可能でないチケットコードが供給情報に含まれていれば引数エラー
    // 供給情報ごとに確認
    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    await Promise.all(offers.map(async (offer, offerIndex) => {
        let offerWithDetails: factory.offer.seatReservation.IOfferWithDetails;
        let availableSalesTicket: COA.services.reserve.ISalesTicketResult | ICOAMvtkTicket | undefined;
        let coaPointTicket: COA.services.master.ITicketResult | undefined;

        // ポイント消費鑑賞券の場合
        if (typeof offer.ticketInfo.usePoint === 'number' && offer.ticketInfo.usePoint > 0) {
            // COA側のマスタ構成で、
            // 券種マスタに消費ポイント
            // 販売可能チケット情報に販売金額
            // を持っているので、処理が少し冗長になってしまうが、しょうがない
            try {
                let availableTickets: COA.services.master.ITicketResult[] | undefined = coaTickets;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (availableTickets === undefined) {
                    debug('finding mvtkTicket...', offer.ticketInfo.ticketCode, {
                        theaterCode: coaInfo.theaterCode,
                        kbnDenshiken: offer.ticketInfo.mvtkKbnDenshiken,
                        kbnMaeuriken: offer.ticketInfo.mvtkKbnMaeuriken,
                        kbnKensyu: offer.ticketInfo.mvtkKbnKensyu,
                        salesPrice: offer.ticketInfo.mvtkSalesPrice,
                        appPrice: offer.ticketInfo.mvtkAppPrice,
                        kbnEisyahousiki: offer.ticketInfo.kbnEisyahousiki,
                        titleCode: coaInfo.titleCode,
                        titleBranchNum: coaInfo.titleBranchNum
                    });
                    availableTickets = await COA.services.master.ticket({
                        theaterCode: coaInfo.theaterCode
                    });
                }
                coaPointTicket = availableTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if: please write tests */
                if (coaPointTicket === undefined) {
                    throw new factory.errors.NotFound(
                        `offers.${offerIndex}`,
                        `ticketInfo of ticketCode ${offer.ticketInfo.ticketCode} is invalid.`);
                }
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next: please write tests */
                // COAサービスエラーの場合ハンドリング
                if (error.name === 'COAServiceError') {
                    // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
                    // 500未満であればクライアントエラーとみなす
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (error.code < INTERNAL_SERVER_ERROR) {
                        throw new factory.errors.NotFound(
                            `offers.${offerIndex}`,
                            `ticketCode ${offer.ticketInfo.ticketCode} not found. ${error.message}`
                        );
                    }
                }

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next: please write tests */
                throw error;
            }

            availableSalesTicket = availableSalesTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);
            // 利用可能な券種が見つからなければエラー
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (availableSalesTicket === undefined) {
                throw new factory.errors.NotFound(`offers.${offerIndex}`, `ticketCode ${offer.ticketInfo.ticketCode} not found.`);
            }
        } else if (offer.ticketInfo.mvtkAppPrice > 0) {
            // ムビチケの場合、ムビチケ情報をCOA券種に変換
            try {
                debug('finding mvtkTicket...', offer.ticketInfo.ticketCode, {
                    theaterCode: coaInfo.theaterCode,
                    kbnDenshiken: offer.ticketInfo.mvtkKbnDenshiken,
                    kbnMaeuriken: offer.ticketInfo.mvtkKbnMaeuriken,
                    kbnKensyu: offer.ticketInfo.mvtkKbnKensyu,
                    salesPrice: offer.ticketInfo.mvtkSalesPrice,
                    appPrice: offer.ticketInfo.mvtkAppPrice,
                    kbnEisyahousiki: offer.ticketInfo.kbnEisyahousiki,
                    titleCode: coaInfo.titleCode,
                    titleBranchNum: coaInfo.titleBranchNum
                });
                const mvtkTicketcodeResult = await COA.services.master.mvtkTicketcode({
                    theaterCode: coaInfo.theaterCode,
                    kbnDenshiken: offer.ticketInfo.mvtkKbnDenshiken,
                    kbnMaeuriken: offer.ticketInfo.mvtkKbnMaeuriken,
                    kbnKensyu: offer.ticketInfo.mvtkKbnKensyu,
                    salesPrice: offer.ticketInfo.mvtkSalesPrice,
                    appPrice: offer.ticketInfo.mvtkAppPrice,
                    kbnEisyahousiki: offer.ticketInfo.kbnEisyahousiki,
                    titleCode: coaInfo.titleCode,
                    titleBranchNum: coaInfo.titleBranchNum,
                    dateJouei: coaInfo.dateJouei
                });
                availableSalesTicket = {
                    ...mvtkTicketcodeResult,
                    // ムビチケチケットインターフェース属性が少なめなので補ってあげる
                    stdPrice: 0,
                    salePrice: mvtkTicketcodeResult.addPrice,
                    addGlasses: mvtkTicketcodeResult.addPriceGlasses
                };
            } catch (error) {
                // COAサービスエラーの場合ハンドリング
                if (error.name === 'COAServiceError') {
                    // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
                    // 500未満であればクライアントエラーとみなす
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (error.code < INTERNAL_SERVER_ERROR) {
                        throw new factory.errors.NotFound(
                            `offers.${offerIndex}`,
                            `ticketCode ${offer.ticketInfo.ticketCode} not found. ${error.message}`
                        );
                    }
                }

                throw error;
            }

            // COA券種が見つかっても、指定された券種コードと異なればエラー
            if (offer.ticketInfo.ticketCode !== availableSalesTicket.ticketCode) {
                throw new factory.errors.NotFound(
                    `offers.${offerIndex}`,
                    `ticketInfo of ticketCode ${offer.ticketInfo.ticketCode} is invalid.`);
            }
        } else {
            availableSalesTicket = availableSalesTickets.find((t) => t.ticketCode === offer.ticketInfo.ticketCode);

            // 利用可能な券種が見つからなければエラー
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (availableSalesTicket === undefined) {
                throw new factory.errors.NotFound(`offers.${offerIndex}`, `ticketCode ${offer.ticketInfo.ticketCode} not found.`);
            }

            const ticketCode = availableSalesTicket.ticketCode;

            // 制限単位がn人単位(例えば夫婦割り)の場合、同一券種の数を確認
            // '001'の値は、区分マスター取得APIにて、"kubunCode": "011"を指定すると取得できる
            if (availableSalesTicket.limitUnit === '001') {
                const numberOfSameOffer = offers.filter((o) => o.ticketInfo.ticketCode === ticketCode).length;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (numberOfSameOffer % availableSalesTicket.limitCount !== 0) {
                    // 割引条件が満たされていません
                    // 選択した券種の中に、割引券が含まれています。
                    // 割引券の適用条件を再度ご確認ください。
                    const invalidOfferIndexes = offers.reduce<number[]>(
                        (a, b, index) => (b.ticketInfo.ticketCode === ticketCode) ? [...a, ...[index]] : a,
                        []
                    );

                    throw invalidOfferIndexes.map((index) => new factory.errors.Argument(`offers.${index}`, '割引条件が満たされていません。'));
                }
            }
        }

        offerWithDetails = {
            typeOf: 'Offer',
            id: availableSalesTicket.ticketCode,
            name: { ja: availableSalesTicket.ticketName, en: availableSalesTicket.ticketNameEng },
            alternateName: { ja: availableSalesTicket.ticketNameKana, en: '' },
            price: availableSalesTicket.salePrice,
            priceCurrency: factory.priceCurrency.JPY,
            seatNumber: offer.seatNumber,
            seatSection: offer.seatSection,
            ticketInfo: {
                ticketCode: availableSalesTicket.ticketCode,
                ticketName: availableSalesTicket.ticketName,
                ticketNameEng: availableSalesTicket.ticketNameEng,
                ticketNameKana: availableSalesTicket.ticketNameKana,
                stdPrice: availableSalesTicket.stdPrice,
                addPrice: availableSalesTicket.addPrice,
                disPrice: 0,
                salePrice: availableSalesTicket.salePrice,
                addGlasses: 0, // まずメガネ代0でセット
                ticketCount: 1,
                seatNum: offer.seatNumber,

                mvtkAppPrice: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkAppPrice : 0,
                kbnEisyahousiki: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.kbnEisyahousiki : '00',
                mvtkNum: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkNum : '',
                mvtkKbnDenshiken: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnDenshiken : '00',
                mvtkKbnMaeuriken: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnMaeuriken : '00',
                mvtkKbnKensyu: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkKbnKensyu : '00',
                mvtkSalesPrice: (offer.ticketInfo.mvtkAppPrice > 0) ? offer.ticketInfo.mvtkSalesPrice : 0,

                usePoint: (coaPointTicket !== undefined) ? coaPointTicket.usePoint : 0
            }
        };

        // メガネ代込みの要求の場合は、販売単価調整&メガネ代をセット
        // 販売可能チケットからセットする。
        const includeGlasses = (offer.ticketInfo.addGlasses > 0);
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (includeGlasses) {
            offerWithDetails.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
            (<number>offerWithDetails.price) += availableSalesTicket.addGlasses;
            offerWithDetails.ticketInfo.salePrice += availableSalesTicket.addGlasses;
            offerWithDetails.ticketInfo.addGlasses = availableSalesTicket.addGlasses;
        }

        offersWithDetails.push({ ...offerWithDetails, additionalProperty: offer.additionalProperty });
    }));

    return offersWithDetails;
}

/**
 * 供給情報から承認アクションの価格を導き出す
 */
function offers2resultPrice(
    offers: factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]
) {
    const price = offers.reduce((a, b) => a + (<number>b.price), 0);
    const requiredPoint = offers.reduce((a, b) => a + b.ticketInfo.usePoint, 0);

    return { price, requiredPoint };
}

/**
 * 座席を仮予約する
 * 承認アクションオブジェクトが返却されます。
 */
// tslint:disable-next-line:max-func-body-length
export function create(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    agent: { id: string };
    transaction: { id: string };
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        offer?: OfferRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // イベントを取得
        const screeningEvent = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.object.event.id
        });

        // 供給情報の有効性を確認
        const acceptedOffer = await validateOffers(
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            params.object.acceptedOffer,
            (repos.offer !== undefined)
                ? /* istanbul ignore next */ repos.offer.searchCOATickets({ theaterCode: screeningEvent.superEvent.location.branchCode })
                : undefined
        );

        // 承認アクションを開始
        const actionAttributes: factory.action.authorize.offer.seatReservation.IAttributes<WebAPIIdentifier.COA> = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation,
                acceptedOffer: acceptedOffer,
                event: screeningEvent,
                ...{ offers: acceptedOffer } // 互換性維持のため
            },
            agent: transaction.seller,
            recipient: transaction.agent,
            purpose: { // purposeは取引
                typeOf: transaction.typeOf,
                id: transaction.id
            },
            instrument: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.COA }
        };
        const action = await repos.action.start(actionAttributes);

        // 必ず定義されている前提
        const coaInfo = <factory.event.screeningEvent.ICOAInfo>screeningEvent.coaInfo;

        // COA仮予約
        const updTmpReserveSeatArgs = {
            theaterCode: coaInfo.theaterCode,
            dateJouei: coaInfo.dateJouei,
            titleCode: coaInfo.titleCode,
            titleBranchNum: coaInfo.titleBranchNum,
            timeBegin: coaInfo.timeBegin,
            screenCode: coaInfo.screenCode,
            listSeat: params.object.acceptedOffer.map((offer) => {
                return {
                    seatSection: offer.seatSection,
                    seatNum: offer.seatNumber
                };
            })
        };
        let updTmpReserveSeatResult: COA.services.reserve.IUpdTmpReserveSeatResult;
        try {
            debug('updTmpReserveSeat processing...', updTmpReserveSeatArgs);
            updTmpReserveSeatResult = await COA.services.reserve.updTmpReserveSeat(updTmpReserveSeatArgs);
            debug('updTmpReserveSeat processed', updTmpReserveSeatResult);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            // メッセージ「座席取得失敗」の場合は、座席の重複とみなす
            if (error.message === '座席取得失敗') {
                throw new factory.errors.AlreadyInUse('action.object', ['offers'], error.message);
            }

            // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
            const coaServiceHttpStatusCode = error.code;

            // 500未満であればクライアントエラーとみなす
            if (Number.isInteger(coaServiceHttpStatusCode)) {
                if (coaServiceHttpStatusCode < INTERNAL_SERVER_ERROR) {
                    throw new factory.errors.Argument('Event', error.message);
                } else {
                    throw new factory.errors.ServiceUnavailable('Reservation service temporarily unavailable.');
                }
            }

            throw new factory.errors.ServiceUnavailable('Unexepected error occurred.');
        }

        // アクションを完了
        debug('ending authorize action...');
        const { price, requiredPoint } = offers2resultPrice(acceptedOffer);
        const result: factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA> = {
            price: price,
            priceCurrency: factory.priceCurrency.JPY,
            point: requiredPoint,
            requestBody: updTmpReserveSeatArgs,
            responseBody: updTmpReserveSeatResult,
            ...{ updTmpReserveSeatArgs, updTmpReserveSeatResult } // 互換性維持のため
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

/**
 * 座席予約承認アクションをキャンセルする
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
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // MongoDBでcompleteステータスであるにも関わらず、COAでは削除されている、というのが最悪の状況
        // それだけは回避するためにMongoDBを先に変更
        const action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>action.result;

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (actionResult.requestBody !== undefined && actionResult.responseBody !== undefined) {
            // 座席仮予約削除
            debug('delTmpReserve processing...', action);
            await COA.services.reserve.delTmpReserve({
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
    id: string;
    agent: { id: string };
    transaction: { id: string };
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
}): ICreateOperation<factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>> {
    return async (repos: {
        event: EventRepo;
        action: ActionRepo;
        offer?: OfferRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // アクション中のイベント識別子と座席リストが合っているかどうか確認
        const authorizeAction = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>>
            await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
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
        const allSeatsMatched = authorizeAction.object.acceptedOffer.every((offer, index) => {
            return (offer.seatSection === params.object.acceptedOffer[index].seatSection
                && offer.seatNumber === params.object.acceptedOffer[index].seatNumber);
        });
        if (!allSeatsMatched) {
            throw new factory.errors.Argument('offers', 'seatSection or seatNumber not matched.');
        }

        // イベントを取得
        const screeningEvent = await repos.event.findById({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            id: params.object.event.id
        });

        // 供給情報の有効性を確認
        const acceptedOffer = await validateOffers(
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            params.object.acceptedOffer,
            (repos.offer !== undefined)
                ? /* istanbul ignore next */ repos.offer.searchCOATickets({ theaterCode: screeningEvent.superEvent.location.branchCode })
                : undefined
        );

        // 供給情報と価格を変更してからDB更新
        authorizeAction.object.acceptedOffer = acceptedOffer;
        (<any>authorizeAction.object).offers = acceptedOffer; // 互換性維持のため

        const { price, requiredPoint } = offers2resultPrice(acceptedOffer);
        (<factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>authorizeAction.result).price
            = price;
        (<factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>authorizeAction.result).point
            = requiredPoint;

        const actionResult =
            (<factory.action.authorize.offer.seatReservation.IResult<WebAPIIdentifier.COA>>authorizeAction.result);

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

                return <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>>doc.toObject();
            });
    };
}
