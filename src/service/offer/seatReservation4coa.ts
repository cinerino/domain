import * as COA from '@motionpicture/coa-service';
import * as createDebug from 'debug';
import { INTERNAL_SERVER_ERROR } from 'http-status';

import { credentials } from '../../credentials';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as EventRepo } from '../../repo/event';
import { InMemoryRepository as OfferRepo } from '../../repo/offer';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as factory from '../../factory';

const debug = createDebug('cinerino-domain:service');

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

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
export type ICOAMvtkTicket = COA.factory.master.IMvtkTicketcodeResult & {
    stdPrice: number;
    salePrice: number;
    addGlasses: number;
};

export type IAcceptedOfferWithoutDetail =
    factory.action.authorize.offer.seatReservation.IAcceptedOfferWithoutDetail<WebAPIIdentifier.COA> & {
        ticketInfo: factory.offer.seatReservation.ICOATicketInfo & {
            spseatAdd1: number;
            spseatAdd2: number;
            spseatKbn: string;
        };
    };

async function createAcceptedOffersWithoutDetails(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}): Promise<IAcceptedOfferWithoutDetail[]> {
    const reserveService = new COA.service.Reserve({
        endpoint: credentials.coa.endpoint,
        auth: coaAuthClient
    });

    const { listSeat } = await reserveService.stateReserveSeat(params.coaInfo);

    // 供給情報の有効性を確認
    return params.object.acceptedOffer.map((offer) => {
        const section = listSeat.find((s) => s.seatSection === offer.seatSection);
        if (section === undefined) {
            throw new factory.errors.NotFound('Available Section');
        }

        const freeSeat = section.listFreeSeat.find((s) => s.seatNum === offer.seatNumber);
        if (freeSeat === undefined) {
            // throw new factory.errors.NotFound('Available Seat');
            throw new factory.errors.AlreadyInUse('offer', ['seatNumber'], 'Seat not available');
        }

        const spseatAdd1 = (typeof freeSeat.spseatAdd1 === 'number') ? freeSeat.spseatAdd1 : 0;
        const spseatAdd2 = (typeof freeSeat.spseatAdd2 === 'number') ? freeSeat.spseatAdd2 : 0;
        const spseatKbn = (typeof freeSeat.spseatKbn === 'string') ? freeSeat.spseatKbn : '';

        return {
            ...offer,
            ticketInfo: {
                ...offer.ticketInfo,
                spseatAdd1: spseatAdd1,
                spseatAdd2: spseatAdd2,
                spseatKbn: spseatKbn
            }
        };
    });
}

// tslint:disable-next-line:max-func-body-length
async function offer2availableSalesTicket(params: {
    offers: IAcceptedOfferWithoutDetail[];
    offer: IAcceptedOfferWithoutDetail;
    offerIndex: number;
    availableSalesTickets: COA.factory.reserve.ISalesTicketResult[];
    coaInfo: factory.event.screeningEvent.ICOAInfo;
    coaTickets?: COA.factory.master.ITicketResult[];
}) {
    let availableSalesTicket: COA.factory.reserve.ISalesTicketResult | ICOAMvtkTicket | undefined;
    let coaPointTicket: COA.factory.master.ITicketResult | undefined;

    const offers = params.offers;
    const offer = params.offer;
    const offerIndex = params.offerIndex;
    const availableSalesTickets = params.availableSalesTickets;
    const coaInfo = params.coaInfo;

    const masterService = new COA.service.Master({
        endpoint: credentials.coa.endpoint,
        auth: coaAuthClient
    });

    // ポイント消費鑑賞券の場合
    if (typeof offer.ticketInfo.usePoint === 'number' && offer.ticketInfo.usePoint > 0) {
        // COA側のマスタ構成で、
        // 券種マスタに消費ポイント
        // 販売可能チケット情報に販売金額
        // を持っているので、処理が少し冗長になってしまうが、しょうがない
        try {
            let availableTickets: COA.factory.master.ITicketResult[] | undefined = params.coaTickets;
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (availableTickets === undefined) {
                debug('finding mvtkTicket...', offer.ticketInfo.ticketCode);
                availableTickets = await masterService.ticket({
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
            debug('finding mvtkTicket...', offer.ticketInfo.ticketCode);
            const mvtkTicketcodeResult = await masterService.mvtkTicketcode({
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

    return {
        availableSalesTicket,
        coaPointTicket
    };
}

function availableSalesTicket2offerWithDetails(params: {
    availableSalesTicket: COA.factory.reserve.ISalesTicketResult | ICOAMvtkTicket;
    coaPointTicket: COA.factory.master.ITicketResult | undefined;
    offer: IAcceptedOfferWithoutDetail;
    offerIndex: number;
}) {
    let offerWithDetails: factory.offer.seatReservation.IOfferWithDetails;

    const availableSalesTicket = params.availableSalesTicket;
    const coaPointTicket = params.coaPointTicket;
    const offer = params.offer;

    const includeGlasses = (offer.ticketInfo.addGlasses > 0);
    const addGlasses = (includeGlasses) ? availableSalesTicket.addGlasses : 0;
    const spseatAdd1 = offer.ticketInfo.spseatAdd1;
    const spseatAdd2 = offer.ticketInfo.spseatAdd2;

    // 実際の売上金額を算出
    const price = [
        Number(availableSalesTicket.salePrice),
        addGlasses,
        spseatAdd1,
        spseatAdd2
    ].reduce((a, b) => a + b, 0);

    // COAに渡す販売金額については、特別席加算額は興収部分のみ加算
    const salePrice = [
        Number(availableSalesTicket.salePrice),
        addGlasses,
        spseatAdd1
    ].reduce((a, b) => a + b, 0);

    offerWithDetails = {
        typeOf: 'Offer',
        id: availableSalesTicket.ticketCode,
        name: { ja: availableSalesTicket.ticketName, en: availableSalesTicket.ticketNameEng },
        alternateName: { ja: availableSalesTicket.ticketNameKana, en: '' },
        price: price,
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
            salePrice: salePrice,
            spseatAdd1: spseatAdd1,
            spseatAdd2: spseatAdd2,
            spseatKbn: offer.ticketInfo.spseatKbn,
            addGlasses: addGlasses,
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

    // メガネ代込み要求の場合、チケット名調整特別対応
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore else */
    if (includeGlasses) {
        offerWithDetails.ticketInfo.ticketName = `${availableSalesTicket.ticketName}メガネ込み`;
    }

    return offerWithDetails;
}

/**
 * 座席予約に対する承認アクションを開始する前の処理
 * 供給情報の有効性の確認などを行う。
 * この処理次第で、どのような供給情報を受け入れられるかが決定するので、とても大事な処理です。
 * バグ、不足等あれば、随時更新することが望ましい。
 */
async function validateOffers(
    isMember: boolean,
    screeningEvent: factory.event.screeningEvent.IEvent,
    offers: IAcceptedOfferWithoutDetail[],
    coaTickets?: COA.factory.master.ITicketResult[]
): Promise<factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[]> {
    const reserveService = new COA.service.Reserve({
        endpoint: credentials.coa.endpoint,
        auth: coaAuthClient
    });

    // 詳細情報ありの供給情報リストを初期化
    // 要求された各供給情報について、バリデーションをかけながら、このリストに追加していく
    const offersWithDetails: factory.action.authorize.offer.seatReservation.IAcceptedOffer<WebAPIIdentifier.COA>[] = [];

    // 供給情報が適切かどうか確認
    const availableSalesTickets: COA.factory.reserve.ISalesTicketResult[] = [];

    // 必ず定義されている前提
    const coaInfo = <factory.event.screeningEvent.ICOAInfo>screeningEvent.coaInfo;

    // COA券種取得(非会員)
    const salesTickets4nonMember = await reserveService.salesTicket({
        theaterCode: coaInfo.theaterCode,
        dateJouei: coaInfo.dateJouei,
        titleCode: coaInfo.titleCode,
        titleBranchNum: coaInfo.titleBranchNum,
        timeBegin: coaInfo.timeBegin,
        flgMember: COA.factory.reserve.FlgMember.NonMember
    });
    availableSalesTickets.push(...salesTickets4nonMember);

    // COA券種取得(会員)
    if (isMember) {
        const salesTickets4member = await reserveService.salesTicket({
            theaterCode: coaInfo.theaterCode,
            dateJouei: coaInfo.dateJouei,
            titleCode: coaInfo.titleCode,
            titleBranchNum: coaInfo.titleBranchNum,
            timeBegin: coaInfo.timeBegin,
            flgMember: COA.factory.reserve.FlgMember.Member
        });
        availableSalesTickets.push(...salesTickets4member);
    }

    // 利用可能でないチケットコードがオファーに含まれていれば引数エラー
    // オファーごとに確認
    await Promise.all(offers.map(async (offer, offerIndex) => {
        const { availableSalesTicket, coaPointTicket } = await offer2availableSalesTicket({
            offers: offers,
            offer: offer,
            offerIndex: offerIndex,
            availableSalesTickets: availableSalesTickets,
            coaInfo: coaInfo,
            coaTickets: coaTickets
        });

        const offerWithDetails = availableSalesTicket2offerWithDetails({
            availableSalesTicket, coaPointTicket, offer, offerIndex
        });

        offersWithDetails.push({
            ...offerWithDetails,
            additionalProperty: offer.additionalProperty,
            id: <string>offerWithDetails.id,
            ...{
                ticketedSeat: {
                    typeOf: factory.chevre.placeType.Seat,
                    // seatingType?: ISeatingType;
                    seatNumber: offerWithDetails.seatNumber,
                    seatRow: '',
                    seatSection: offerWithDetails.seatSection
                }
            }
        });
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

function createUpdTmpReserveSeatArgs(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    coaInfo: factory.event.screeningEvent.ICOAInfo;
}): COA.factory.reserve.IUpdTmpReserveSeatArgs {
    return {
        theaterCode: params.coaInfo.theaterCode,
        dateJouei: params.coaInfo.dateJouei,
        titleCode: params.coaInfo.titleCode,
        titleBranchNum: params.coaInfo.titleBranchNum,
        timeBegin: params.coaInfo.timeBegin,
        screenCode: params.coaInfo.screenCode,
        listSeat: params.object.acceptedOffer.map((offer) => {
            return {
                seatSection: offer.seatSection,
                seatNum: offer.seatNumber
            };
        })
    };
}

/**
 * 座席を仮予約する
 * 承認アクションオブジェクトが返却されます。
 */
export function create(params: {
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
    agent: { id: string };
    transaction: { id: string };
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
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // イベントを取得
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
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            acceptedOffersWithoutDetails,
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

        // COA仮予約
        const updTmpReserveSeatArgs = createUpdTmpReserveSeatArgs({ object: params.object, coaInfo: coaInfo });
        let updTmpReserveSeatResult: COA.factory.reserve.IUpdTmpReserveSeatResult;
        try {
            debug('updTmpReserveSeat processing...', updTmpReserveSeatArgs);
            const reserveService = new COA.service.Reserve({
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            });
            updTmpReserveSeatResult = await reserveService.updTmpReserveSeat(updTmpReserveSeatArgs);
            debug('updTmpReserveSeat processed', updTmpReserveSeatResult);
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw handleUpdTmpReserveSeatError(error);
        }

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
 * COA仮予約エラーハンドリング
 */
function handleUpdTmpReserveSeatError(error: any) {
    let handledError: Error = new factory.errors.ServiceUnavailable('Unexepected error occurred');

    // if (error.message === '座席取得失敗') {
    // }

    // メッセージ「既に予約済みです」の場合は、座席の重複とみなす
    if (error.message === '既に予約済みです') {
        handledError = new factory.errors.AlreadyInUse('offer', ['seatNumber'], 'Seat not available');
    }

    // COAはクライアントエラーかサーバーエラーかに関わらずステータスコード200 or 500を返却する。
    const coaServiceHttpStatusCode = error.code;

    // 500未満であればクライアントエラーとみなす
    if (Number.isInteger(coaServiceHttpStatusCode)) {
        if (coaServiceHttpStatusCode < INTERNAL_SERVER_ERROR) {
            handledError = new factory.errors.Argument('Event', error.message);
        } else {
            handledError = new factory.errors.ServiceUnavailable('Reservation service temporarily unavailable.');
        }
    }

    return handledError;
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
            const reserveService = new COA.service.Reserve({
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            });

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
    id: string;
    agent: { id: string };
    transaction: { id: string };
    object: factory.action.authorize.offer.seatReservation.IObjectWithoutDetail<WebAPIIdentifier.COA>;
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
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 取引内のアクションかどうか確認
        const action = <factory.action.authorize.offer.seatReservation.IAction<WebAPIIdentifier.COA>>
            await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        // アクション中のイベント識別子と座席リストが合っているかどうか確認
        const authorizeAction = action;
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
        const screeningEvent = await repos.event.findById<factory.chevre.eventType.ScreeningEvent>({
            id: params.object.event.id
        });

        // 供給情報の有効性を確認
        const acceptedOffersWithoutDetails: IAcceptedOfferWithoutDetail[] = params.object.acceptedOffer.map((offer) => {
            const originalOffer = authorizeAction.object.acceptedOffer.find((o) => {
                return o.seatSection === offer.seatSection
                    && o.seatNumber === offer.seatNumber;
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
            (transaction.agent.memberOf !== undefined),
            screeningEvent,
            acceptedOffersWithoutDetails,
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

                return doc.toObject();
            });
    };
}
